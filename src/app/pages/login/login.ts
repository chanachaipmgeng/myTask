import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { currentViewer, effectiveRole, setViewer, setWorkspaceMode } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { AccessRole, Person } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession, setSessionUser } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { ThemeService } from '../../core/theme.service';
import { BentoSpotlightDirective, RevealDirective, StaggerDirective } from '../../shared/motion';
import { EcosystemHubComponent, FlashMessagesComponent } from '../../shared/ui';
import { SfCheckboxComponent } from '../../shared/sf/sf-checkbox/sf-checkbox';

type DevRosterAccount = {
  id: string;
  nickname: string;
  fullName: string;
  role: string;
  department?: string | null;
  access: AccessRole;
};

type LoginShowcaseScene = 'ecosystem' | 'workflow' | 'bento';

interface FlowStageMeta {
  step: string;
  title: string;
  sub: string;
  badge: string;
  tone: 'primary' | 'coral' | 'violet' | 'cyan' | 'emerald';
}

const FLOW_STAGES: readonly FlowStageMeta[] = [
  {
    step: '01',
    title: 'ใบงานเข้า',
    sub: 'myProject Auto-SLA',
    badge: 'ข้ามวันหยุด',
    tone: 'primary',
  },
  {
    step: '02',
    title: 'พัฒนา & MR',
    sub: 'GitLab Branch Link',
    badge: 'รีวิวอัตโนมัติ',
    tone: 'coral',
  },
  {
    step: '03',
    title: 'Fair Cutoff',
    sub: 'วัดตรงเวลาที่ Ready QA',
    badge: 'ไม่หักรอคิว QA',
    tone: 'violet',
  },
  {
    step: '04',
    title: 'QA & DoD',
    sub: 'ตรวจคุณภาพ 6 สายงาน',
    badge: 'เครดิต QA 15–20%',
    tone: 'cyan',
  },
  {
    step: '05',
    title: 'ดัชนีคะแนน',
    sub: 'Man-day + AI Coach',
    badge: 'เป็นธรรม 100%',
    tone: 'emerald',
  },
];

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    SfCheckboxComponent,
    EcosystemHubComponent,
    FlashMessagesComponent,
    BentoSpotlightDirective,
    RevealDirective,
    StaggerDirective,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage implements AfterViewInit {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notice = inject(ShellNotice);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(ThemeService);

  @ViewChild('shellEl') private shellEl?: ElementRef<HTMLElement>;

  protected readonly session = currentSession;
  protected readonly viewer = currentViewer;
  protected readonly role = effectiveRole;
  protected readonly usingApi = this.scorecard.usingApi;
  protected readonly devAccounts = signal<DevRosterAccount[]>([]);
  protected readonly roster = computed<DevRosterAccount[]>(() => {
    const live = this.scorecard.roster();
    if (live.length > 0) {
      return live;
    }
    return this.devAccounts();
  });

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly rememberMe = signal(true);

  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  // Interactive Showcase State
  protected readonly activeScene = signal<LoginShowcaseScene>('ecosystem');
  protected readonly activeFlowStep = signal(2);
  protected readonly showcasePaused = signal(false);
  protected readonly flowStages = FLOW_STAGES;

  protected readonly sceneMeta = computed(() => {
    switch (this.activeScene()) {
      case 'workflow':
        return {
          eyebrow: 'FAIR SCORING PIPELINE',
          headline: 'โฟลว์งานไหลลื่น',
          accent: 'วัดคะแนนอย่างเป็นธรรม',
          subtitle: 'นับตรงเวลาทันทีเมื่อส่งเข้า Ready for QA พร้อม Auto-SLA วันทำการและ MD-Direct Auto-Shift อัตโนมัติ',
        };
      case 'bento':
        return {
          eyebrow: 'SMART BENTO WORKSPACE',
          headline: 'เห็นภาพรวมทุกมิติ',
          accent: 'พร้อม AI Coach ประจำตัว',
          subtitle: 'ติดตาม Active WIP โควตา Man-day แนวโน้มดัชนี และแจ้งเตือนความเสี่ยงก่อนหลุดกำหนดในจอเดียว',
        };
      default:
        return {
          eyebrow: 'BENEFITS · UNIFIED WORKSPACE',
          headline: 'รวมทุกเครื่องมือไว้ที่เดียว',
          accent: 'ทีมของคุณเห็นภาพตรงกัน',
          subtitle: 'myTask เชื่อม myProject, GitLab MR, MS Teams และเกณฑ์คะแนน Man-day ให้ไหลเวียนอัตโนมัติในพื้นที่เดียว',
        };
    }
  });

  protected readonly canUseDevLogin = computed(
    () => !this.usingApi() || this.scorecard.devLoginEnabled(),
  );
  protected readonly isSignedInAdmin = computed(
    () => this.session()?.access === 'admin',
  );
  protected readonly quickLoginChips = computed(() => {
    const list = this.roster();
    if (list.length === 0) {
      return [] as { id: string; label: string }[];
    }
    const roleLabel = (access: AccessRole | undefined): string =>
      access === 'admin' ? 'Admin' : access === 'lead' ? 'Lead' : 'Member';
    const picked: DevRosterAccount[] = [];
    const pick = (pred: (p: DevRosterAccount) => boolean) => {
      const found = list.find((p) => !picked.some((x) => x.id === p.id) && pred(p));
      if (found) picked.push(found);
    };
    pick((p) => p.access === 'admin' && p.id.toLowerCase().includes('chanachai'));
    pick((p) => p.access === 'admin');
    pick((p) => p.access === 'lead');
    pick((p) => p.access === 'member' && p.id.toLowerCase().includes('nakarin'));
    pick((p) => p.access === 'member');
    while (picked.length < 3 && picked.length < list.length) {
      pick(() => true);
    }
    return picked.slice(0, 3).map((p) => ({
      id: p.id,
      label: `${p.nickname || p.id} · ${roleLabel(p.access)}`,
    }));
  });

  constructor() {
    effect(() => {
      const apiReady = this.scorecard.apiReady();
      const devEnabled = this.scorecard.devLoginEnabled();
      const hasRoster = this.scorecard.roster().length > 0;
      if (apiReady && devEnabled && !hasRoster && this.devAccounts().length === 0) {
        void this.loadDevRoster();
      }
    });
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    // Gentle auto-cycle between showcase scenes & workflow stage pulse
    const scenes: readonly LoginShowcaseScene[] = ['ecosystem', 'workflow', 'bento'];
    const sceneTimer = setInterval(() => {
      if (this.showcasePaused()) return;
      const idx = scenes.indexOf(this.activeScene());
      this.activeScene.set(scenes[(idx + 1) % scenes.length]!);
    }, 8500);

    const flowTimer = setInterval(() => {
      if (this.activeScene() === 'workflow' && !this.showcasePaused()) {
        this.activeFlowStep.update((n) => (n + 1) % FLOW_STAGES.length);
      }
    }, 2200);

    // Subtle mouse-parallax nebula glow outside Angular zone
    const el = this.shellEl?.nativeElement;
    let rafId: number | null = null;
    let targetX = 50;
    let targetY = 50;

    const flush = () => {
      rafId = null;
      if (!el) return;
      el.style.setProperty('--px', `${targetX}%`);
      el.style.setProperty('--py', `${targetY}%`);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      targetX = Math.round((e.clientX / Math.max(1, window.innerWidth)) * 100);
      targetY = Math.round((e.clientY / Math.max(1, window.innerHeight)) * 100);
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    };

    this.zone.runOutsideAngular(() => {
      el?.addEventListener('pointermove', onPointerMove, { passive: true });
    });

    this.destroyRef.onDestroy(() => {
      clearInterval(sceneTimer);
      clearInterval(flowTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      el?.removeEventListener('pointermove', onPointerMove);
    });
  }

  protected selectScene(scene: LoginShowcaseScene): void {
    this.activeScene.set(scene);
  }

  protected selectFlowStep(index: number): void {
    this.activeFlowStep.set(index);
  }

  protected setShowcasePaused(paused: boolean): void {
    this.showcasePaused.set(paused);
  }

  private async loadDevRoster(): Promise<void> {
    try {
      const res = await this.api.devRoster();
      if (res.enabled && Array.isArray(res.people)) {
        this.devAccounts.set(res.people);
      }
    } catch {
      // Ignore if dev roster is disabled
    }
  }

  protected onUsernameInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.username.set(target?.value ?? '');
  }

  protected onPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.password.set(target?.value ?? '');
  }

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected onRememberMeChange(event: { checked?: boolean }): void {
    this.rememberMe.set(!!event.checked);
  }

  protected onForgotPassword(): void {
    this.notice.info('การรีเซ็ตรหัสผ่านโปรดติดต่อผู้ดูแลระบบเครือข่าย MyHR หรือเข้าสู่ระบบด้วย GitLab SSO');
  }

  protected async submitLogin(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
    }
    const rawInput = this.username().trim();
    if (!rawInput) {
      this.error.set('กรุณาระบุอีเมลองค์กรหรือชื่อผู้ใช้งาน');
      return;
    }

    const cleanInput = rawInput.toLowerCase().replace(/@myhr\.co\.th$/, '');
    const list = this.roster();
    const person =
      list.find((p) => p.id.toLowerCase() === cleanInput) ||
      list.find((p) => p.nickname.toLowerCase() === cleanInput) ||
      list.find((p) => p.fullName.toLowerCase().includes(rawInput.toLowerCase()));

    if (!person) {
      this.error.set(`ไม่พบบัญชีผู้ใช้งาน "${rawInput}" ในระบบองค์กร`);
      return;
    }

    await this.loginAs(person);
  }

  protected async quickLogin(personId: string): Promise<void> {
    const person = this.resolveQuickLoginPerson(personId);
    if (!person) {
      this.error.set(`ไม่พบบัญชี ${personId} ในระบบ`);
      return;
    }
    this.username.set(person.id);
    this.password.set('••••••••••••');
    await this.loginAs(person);
  }

  private resolveQuickLoginPerson(personId: string): DevRosterAccount | undefined {
    const roster = this.roster();
    const direct = roster.find((p) => p.id === personId);
    if (direct) {
      return direct;
    }
    const key = personId.trim().toLowerCase();
    const byIdPrefix = roster.find((p) => p.id.toLowerCase().startsWith(key));
    if (byIdPrefix) {
      return byIdPrefix;
    }
    return roster.find((p) => p.nickname.toLowerCase().includes(key) || p.fullName.toLowerCase().includes(key));
  }

  protected async loginAs(person: DevRosterAccount | Person): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    setWorkspaceMode(null);

    if (this.usingApi()) {
      if (!this.scorecard.devLoginEnabled()) {
        this.error.set('โหมดล็อกอินโดยตรงปิดอยู่ — กรุณาใช้ GitLab OAuth SSO');
        this.busy.set(false);
        return;
      }
      try {
        const result = await this.api.devLogin(person.id);
        if (!result.ok || !result.person) {
          this.error.set(result.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
          this.busy.set(false);
          return;
        }
        setViewer(person.id);
        await this.scorecard.reloadFromApi();
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
        this.busy.set(false);
        return;
      }
    } else if ('plannedMd' in person) {
      setViewer(person.id);
      setSessionUser(person, person.access ?? 'member');
    }

    const access = person.access ?? 'member';
    const initialMode: AccessRole =
      access === 'admin' ? 'admin' : access === 'member' ? 'member' : 'lead';
    setWorkspaceMode(initialMode);
    const text = `เข้าสู่ระบบเป็น ${person.nickname} (${access}) เรียบร้อยแล้ว`;
    this.message.set(text);
    this.notice.success(text);
    this.busy.set(false);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const safeTarget =
      returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') && !returnUrl.startsWith('/login')
        ? returnUrl
        : '/me';
    void this.router.navigateByUrl(safeTarget, { replaceUrl: true });
  }

  protected startGitLabSso(): void {
    window.location.href = '/api/auth/gitlab';
  }

  protected async syncMyProjectUsers(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await this.api.syncOpenProjectUsers();
      await this.scorecard.reloadFromApi();
      const text = `ซิงค์พนักงาน MyProject สำเร็จ · ทั้งหมด ${result.total} คน · เพิ่มใหม่ ${result.created} คน · อัปเดต/เชื่อมโยง ${result.linked + result.updated} คน`;
      this.message.set(text);
      this.notice.success(text);
      if (result.errors && result.errors.length) {
        this.error.set(result.errors.slice(0, 3).join(' | '));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ซิงค์พนักงานไม่สำเร็จ';
      this.error.set(msg);
      this.notice.error(msg);
    } finally {
      this.busy.set(false);
    }
  }
}
