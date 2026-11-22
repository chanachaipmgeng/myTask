import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, input, output, signal } from '@angular/core';
import { SelectedEventArgs, UploaderModule } from '@syncfusion/ej2-angular-inputs';
import { MotionInput, MotionWrapperComponent } from '../../motion/motion-wrapper';

export interface SfUploaderOptions {
  autoUpload?: boolean;
  multiple?: boolean;
  allowedExtensions?: string;
  maxFileSize?: number;
  browseLabel?: string;
  hint?: string;
  compact?: boolean;
  motion?: MotionInput;
}

@Component({
  selector: 'app-sf-uploader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UploaderModule, MotionWrapperComponent],
  template: `
    <app-motion-wrapper [config]="options().motion" variant="fade-up">
    <div
      #dropZone
      class="sf-dropzone"
      [class.is-dragging]="dragging()"
      [class.is-compact]="options().compact"
      (dragenter)="dragging.set(true)"
      (dragover)="dragging.set(true)"
      (dragleave)="dragging.set(false)"
      (drop)="dragging.set(false)"
    >
      <div class="sf-dropzone__header">
        <span class="sf-dropzone__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <div class="sf-dropzone__copy">
          <p class="sf-dropzone__title">ลากไฟล์มาวางที่นี่ หรือคลิกเลือกไฟล์</p>
          <p class="sf-dropzone__hint">
            {{ options().hint || extHint() }}
          </p>
        </div>
      </div>

      <ejs-uploader
        [id]="id()"
        [autoUpload]="options().autoUpload ?? false"
        [multiple]="options().multiple ?? false"
        [allowedExtensions]="resolvedExt()"
        [maxFileSize]="options().maxFileSize ?? 10485760"
        [buttons]="buttons()"
        [dropArea]="dropZone"
        (selected)="selected.emit($event)"
      ></ejs-uploader>
    </div>
    </app-motion-wrapper>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .sf-dropzone {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 1rem 1.15rem;
      border-radius: var(--radius-nested, 14px);
      border: 1.5px dashed color-mix(in srgb, var(--primary, #2746b3) 34%, var(--line, #cbd5e1));
      background: color-mix(in srgb, var(--primary, #2746b3) 4%, var(--surface-glass, #ffffff));
      transition:
        border-color 180ms var(--ease-nordic, ease),
        background-color 180ms var(--ease-nordic, ease),
        box-shadow 180ms var(--ease-nordic, ease);
    }
    .sf-dropzone:hover,
    .sf-dropzone.is-dragging {
      border-color: var(--primary, #2746b3);
      background: color-mix(in srgb, var(--primary, #2746b3) 8%, var(--surface-glass-strong, #ffffff));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, #2746b3) 14%, transparent);
    }
    .sf-dropzone.is-compact {
      padding: 0.7rem 0.9rem;
    }
    .sf-dropzone__header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .sf-dropzone__icon {
      flex: 0 0 auto;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--primary, #2746b3) 12%, transparent);
      color: var(--primary-bright, #2746b3);
    }
    .sf-dropzone__copy {
      min-width: 0;
    }
    .sf-dropzone__title {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--ink);
    }
    .sf-dropzone__hint {
      margin: 0.15rem 0 0;
      font-size: 0.76rem;
      color: var(--muted);
    }
    :host ::ng-deep .sf-dropzone .e-upload {
      border: 0 !important;
      background: transparent !important;
      min-height: 0;
    }
    :host ::ng-deep .sf-dropzone .e-upload .e-file-select-wrap {
      padding: 0 !important;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    :host ::ng-deep .sf-dropzone .e-upload .e-file-select-wrap .e-file-drop {
      font-size: 0.78rem;
      color: var(--muted);
    }
  `,
})
export class SfUploaderComponent {
  @ViewChild('dropZone') private dropZoneRef?: ElementRef<HTMLElement>;

  readonly id = input<string>('');
  readonly allowedExtensions = input<string>('');
  readonly options = input<SfUploaderOptions>({});

  readonly selected = output<SelectedEventArgs>();
  protected readonly dragging = signal(false);

  protected readonly resolvedExt = computed(
    () => this.options().allowedExtensions ?? this.allowedExtensions(),
  );

  protected readonly extHint = computed(() => {
    const ext = this.resolvedExt();
    return ext ? `รองรับไฟล์ ${ext} · สูงสุด 10 MB` : 'รองรับการลากวางไฟล์ · สูงสุด 10 MB';
  });

  protected readonly buttons = computed(() => ({
    browse: this.options().browseLabel ?? 'เลือกไฟล์จากเครื่อง',
  }));
}
