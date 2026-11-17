import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MessageModule } from '@syncfusion/ej2-angular-notifications';

@Component({
  selector: 'app-flash-messages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MessageModule],
  templateUrl: './flash-messages.html',
  styleUrl: './flash-messages.scss',
})
export class FlashMessagesComponent {
  @Input() success: string | null = null;
  @Input() error: string | null = null;
  @Input() info: string | null = null;
  @Input() warning: string | null = null;
}
