import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule, CheckBoxModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { currentViewer, effectiveRole, setViewer, setWorkspaceMode } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { AccessRole, Person } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession, setSessionUser } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';
import { FlashMessagesComponent } from '../../shared/ui/flash-messages/flash-messages';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonModule,
    CheckBoxModule,
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

  protected readonly session = currentSession;
  protected readonly viewer = currentViewer;
  protected readonly role = effectiveRole;
  protected readonly usingApi = this.scorecard.usingApi;
  protected readonly roster = this.scorecard.roster;

  protected readonly username = signal('paweena');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly rememberMe = signal(true);

  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly canUseDevLogin = computed(
    () => !this.usingApi() || this.scorecard.devLoginEnabled(),
  );

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
    const person =
      this.roster().find((p) => p.id.toLowerCase() === cleanInput) ||
      this.roster().find((p) => p.nickname.toLowerCase() === cleanInput) ||
      this.roster().find((p) => p.email?.toLowerCase() === rawInput.toLowerCase()) ||
      this.roster().find((p) => p.fullName.toLowerCase().includes(rawInput.toLowerCase()));

    if (!person) {
      this.error.set(`ไม่พบบัญชีผู้ใช้งาน "${rawInput}" ในระบบองค์กร (ตัวอย่างบัญชี: paweena, nakarin, chanachai)`);
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

  /** Seed shortcut ids → คนจริงจาก sync OpenProject (เช่น chanachai → chanachaiomyhrcoth) */
  private resolveQuickLoginPerson(personId: string): Person | undefined {
    const roster = this.roster();
    const direct = roster.find((p) => p.id === personId);
    if (direct) {
      return direct;
    }
    const key = personId.trim().toLowerCase();
    const byEmail = roster.find((p) => p.email?.toLowerCase().startsWith(`${key}.`) || p.email?.toLowerCase().startsWith(`${key}@`));
    if (byEmail) {
      return byEmail;
    }
    const byIdPrefix = roster.find((p) => p.id.toLowerCase().startsWith(key));
    if (byIdPrefix) {
      return byIdPrefix;
    }
    return roster.find((p) => p.nickname.toLowerCase().includes(key) || p.fullName.toLowerCase().includes(key));
  }

  protected async loginAs(person: Person): Promise<void> {
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
    } else {
      setViewer(person.id);
      setSessionUser(person, person.access ?? 'member');
    }

    const access = person.access ?? 'member';
    const initialMode: AccessRole =
      access === 'admin' ? 'admin' : access === 'member' ? 'member' : 'lead';
    setWorkspaceMode(initialMode);
    const targetRoute = access === 'member' ? '/me' : access === 'admin' ? '/admin' : '/team';
    const text = `เข้าสู่ระบบเป็น ${person.nickname} (${access}) เรียบร้อยแล้ว`;
    this.message.set(text);
    this.notice.success(text);
    this.busy.set(false);
    void this.router.navigate([targetRoute]);
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
