import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { currentViewer, effectiveRole, setViewer, viewAsRole } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { AccessRole, Person } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession, setSessionUser } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { BadgeTone } from '../../shared/ui/badge';
import { FlashMessagesComponent } from '../../shared/ui/flash-messages/flash-messages';

export interface RoleChipOption {
  id: 'All' | AccessRole;
  label: string;
  count: number;
}

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    TextBoxModule,
    MessageModule,
    FlashMessagesComponent,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly scorecard = inject(ScorecardService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly notice = inject(ShellNotice);

  protected readonly authMode = signal<'persona' | 'external'>('persona');
  protected readonly session = currentSession;
  protected readonly viewer = currentViewer;
  protected readonly role = effectiveRole;
  protected readonly usingApi = this.scorecard.usingApi;
  protected readonly roster = this.scorecard.roster;
  protected readonly query = signal('');
  protected readonly roleFilter = signal<'All' | AccessRole>('All');
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly failedAvatars = signal<Record<string, boolean>>({});

  protected avatarFailed(personId: string): boolean {
    return !!this.failedAvatars()[personId];
  }

  protected onAvatarError(personId: string): void {
    this.failedAvatars.update((prev) => ({ ...prev, [personId]: true }));
  }

  protected readonly activePerson = computed(() => {
    const sess = this.session();
    if (sess) {
      return sess.person;
    }
    const id = this.viewer().id;
    return this.roster().find((p) => p.id === id) ?? this.roster()[0];
  });

  protected readonly filteredPeople = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rf = this.roleFilter();
    return this.roster().filter((person) => {
      const access = person.access ?? 'member';
      if (rf !== 'All' && access !== rf) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        person.nickname.toLowerCase().includes(q) ||
        person.fullName.toLowerCase().includes(q) ||
        person.id.toLowerCase().includes(q) ||
        person.role.toLowerCase().includes(q)
      );
    });
  });

  protected readonly roleCounts = computed(() => {
    const all = this.roster();
    return {
      total: all.length,
      admin: all.filter((p) => p.access === 'admin').length,
      lead: all.filter((p) => p.access === 'lead').length,
      member: all.filter((p) => (p.access ?? 'member') === 'member').length,
    };
  });

  protected readonly roleToneMap: Record<string, BadgeTone> = {
    admin: 'danger',
    lead: 'warning',
    member: 'info',
  };

  protected readonly roleChipOptions = computed<RoleChipOption[]>(() => {
    const counts = this.roleCounts();
    return [
      { id: 'All', label: 'ทั้งหมด', count: counts.total },
      { id: 'admin', label: 'ผู้ดูแลระบบ · Admin', count: counts.admin },
      { id: 'lead', label: 'หัวหน้าสายงาน · Lead', count: counts.lead },
      { id: 'member', label: 'พนักงานทั่วไป · Member', count: counts.member },
    ];
  });

  protected readonly canUsePersonaSwitch = computed(
    () => !this.usingApi() || this.scorecard.devLoginEnabled(),
  );

  protected setAuthMode(mode: 'persona' | 'external'): void {
    this.authMode.set(mode);
  }

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.query.set(target?.value ?? '');
  }

  protected clearSearch(): void {
    this.query.set('');
  }

  protected setRoleFilter(value: string): void {
    if (value === 'admin' || value === 'lead' || value === 'member') {
      this.roleFilter.set(value);
      return;
    }
    this.roleFilter.set('All');
  }

  protected async loginAs(person: Person): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    viewAsRole.set(null);

    if (this.usingApi()) {
      if (!this.scorecard.devLoginEnabled()) {
        this.error.set('โหมดสลับบัญชีปิดอยู่ — ใช้ GitLab OAuth SSO');
        this.busy.set(false);
        return;
      }
      try {
        const result = await this.api.devLogin(person.id);
        if (!result.ok || !result.person) {
          this.error.set(result.message ?? 'เข้าสู่ระบบแบบพัฒนาไม่สำเร็จ');
          this.busy.set(false);
          return;
        }
        setViewer(person.id);
        await this.scorecard.reloadFromApi();
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'เข้าสู่ระบบแบบพัฒนาไม่สำเร็จ');
        this.busy.set(false);
        return;
      }
    } else {
      setViewer(person.id);
    }

    const access = person.access ?? 'member';
    const targetRoute = access === 'member' ? '/me' : '/team';
    const text = `เข้าสู่ระบบเป็น ${person.nickname} (${access}) เรียบร้อยแล้ว`;
    this.message.set(text);
    this.notice.success(text);
    this.busy.set(false);
    void this.router.navigate([targetRoute]);
  }

  protected async logout(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.usingApi()) {
        await this.api.logout();
        await this.scorecard.reloadFromApi();
      } else {
        setSessionUser(null, null);
      }
      viewAsRole.set(null);
      this.message.set('ออกจากระบบเซสชันแล้ว');
      this.notice.info('ออกจากระบบแล้ว');
    } catch {
      this.error.set('ออกจากระบบไม่สำเร็จ');
      this.notice.error('ออกจากระบบไม่สำเร็จ');
    } finally {
      this.busy.set(false);
    }
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
