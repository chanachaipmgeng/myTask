import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { WorkspaceFilter } from '../../core/workspace-filter';

/** Deep link `/org/teams` → แท็บทีมบน Person Workspace */
@Component({
  selector: 'app-redirect-org-teams-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="p-4 text-sm opacity-70">กำลังเปิดพนักงาน & ทีม…</p>`,
})
export class RedirectOrgTeamsHub implements OnInit {
  private readonly workspace = inject(WorkspaceFilter);

  ngOnInit(): void {
    void this.workspace.navigateWithFilter(['/workspace/people'], {
      queryParams: { view: 'teams' },
    });
  }
}
