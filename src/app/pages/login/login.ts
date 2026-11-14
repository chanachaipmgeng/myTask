import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { TextBoxModule } from '@syncfusion/ej2-angular-inputs';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';
import { currentViewer, effectiveRole, setViewer, viewAsRole } from '../../core/admin-settings';
import { ApiClient } from '../../core/api-client';
import { AccessRole, Person } from '../../core/models';
import { ScorecardService } from '../../core/scorecard.service';
import { currentSession, setSessionUser } from '../../core/session';
import { ShellNotice } from '../../core/shell-notice';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, TextBoxModule, MessageModule, RouterLink],
  templateUrl: './login.html',
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
  protected readonly query = signal('');
  protected readonly roleFilter = signal<'All' | AccessRole>('All');
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

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

  protected async loginAs(person: Person): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    viewAsRole.set(null);
    setViewer(person.id);

    if (this.usingApi()) {
      try {
        const result = await this.api.devLogin(person.id);
        if (result.ok && result.person) {
          await this.scorecard.reloadFromApi();
        }
      } catch {
        // Fallback to local viewer session when API dev login is disabled
      }
    }

    const access = person.access ?? 'member';
    const targetRoute = access === 'member' ? '/me' : '/team';
    const text = `เข้าสู่ระบบเป็น ${person.nickname} (${access}) เรียบร้อยแล้ว`;
    this.message.set(text);
    this.notice.show(text);
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
      this.notice.show('ออกจากระบบแล้ว');
    } catch {
      this.error.set('ออกจากระบบไม่สำเร็จ');
    } finally {
      this.busy.set(false);
    }
  }

  protected startGitLabSso(): void {
    window.location.href = '/api/auth/gitlab';
  }
}
