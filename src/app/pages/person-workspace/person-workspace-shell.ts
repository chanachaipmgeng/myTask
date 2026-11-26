import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-person-workspace-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<section class="page person-ws flex flex-col gap-4"><router-outlet /></section>`,
  styleUrl: './person-workspace.scss',
})
export class PersonWorkspaceShell {}
