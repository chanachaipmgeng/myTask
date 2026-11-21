import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { WorkspaceFilter } from '../../core/workspace-filter';

/** จากแท็บคนใน /org/teams/:teamId → Person Workspace พร้อม teamId */
@Component({
  selector: 'app-redirect-to-person-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="p-4 text-sm opacity-70">กำลังเปิด Workspace คน…</p>`,
})
export class RedirectToPersonWorkspace implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceFilter);

  ngOnInit(): void {
    const teamId = (this.route.parent?.snapshot.paramMap.get('teamId') ?? '').trim();
    if (teamId) {
      this.workspace.setTeam(teamId);
    }
    void this.workspace.navigateWithFilter(['/workspace/people']);
  }
}
