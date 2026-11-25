import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-mine-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  templateUrl: './hub-shell.html',
  styleUrl: './hub-shell.scss',
})
export class MineShell {
  protected readonly heading = computed(() => 'งานของฉัน');
  protected readonly basePath = '/me';
  protected readonly tabs = computed(() => [] as { text: string; path: string; icon: string }[]);
  protected readonly showTabs = computed(() => false);
  protected readonly activePath = computed(() => '');

  protected tabLink(path: string): string[] {
    return path ? [this.basePath, path] : [this.basePath];
  }
}
