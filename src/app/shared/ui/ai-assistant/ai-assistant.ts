import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from '@syncfusion/ej2-angular-buttons';
import { SpeechToTextModule, TranscriptChangedEventArgs } from '@syncfusion/ej2-angular-inputs';
import { ApiClient, AiStatusResponse } from '../../../core/api-client';
import { ShellNotice } from '../../../core/shell-notice';
import { TicketDetailService } from '../../../core/ticket-detail.service';
import { WorkspaceFilter } from '../../../core/workspace-filter';
import {
  mergeSpeechTranscript,
  speechErrorMessageTh,
} from '../../speech-to-text';

export interface ParsedLine {
  kind: 'heading' | 'bullet' | 'text' | 'spacer';
  segments: Array<{ text: string; bold: boolean }>;
}

export interface ChatBubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  lines: ParsedLine[];
  ticketIds: string[];
  provider?: 'gemini' | 'rule-based';
  time: string;
}

function parseBoldSegments(line: string): Array<{ text: string; bold: boolean }> {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((p) =>
      p.startsWith('**') && p.endsWith('**')
        ? { text: p.slice(2, -2), bold: true }
        : { text: p, bold: false },
    );
}

function parseReplyLines(text: string): ParsedLine[] {
  return text.split(/\r?\n/).map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { kind: 'spacer', segments: [] };
    }
    if (trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
      const clean = trimmed.replace(/^#{3,4}\s+/, '');
      return { kind: 'heading', segments: parseBoldSegments(clean) };
    }
    if (trimmed.startsWith('- ') || /^\d+\.\s+/.test(trimmed)) {
      const clean = trimmed.replace(/^(-\s+|\d+\.\s+)/, '');
      return { kind: 'bullet', segments: parseBoldSegments(clean) };
    }
    return { kind: 'text', segments: parseBoldSegments(trimmed) };
  });
}

function stripForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

@Component({
  selector: 'app-ai-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, SpeechToTextModule],
  templateUrl: './ai-assistant.html',
  styleUrl: './ai-assistant.scss',
})
export class AiAssistantComponent {
  private readonly api = inject(ApiClient);
  private readonly notice = inject(ShellNotice);
  private readonly ticketDetail = inject(TicketDetailService);
  private readonly workspace = inject(WorkspaceFilter);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('messagesViewport') private messagesViewport?: ElementRef<HTMLElement>;

  protected readonly open = signal(false);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly status = signal<AiStatusResponse | null>(null);
  protected readonly autoSpeak = signal(false);
  protected readonly speakingId = signal<string | null>(null);
  protected readonly listening = signal(false);

  protected readonly ttsSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  protected readonly quickPrompts = signal<string[]>([
    'สัปดาห์นี้ใครคิวว่างบ้าง?',
    'ใบงานไหนเสี่ยงเกิน SLA?',
    'สรุปงานของฉันตอนนี้',
    'สรุป Executive Briefing ทีม',
  ]);

  protected readonly messages = signal<ChatBubble[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'สวัสดีครับ ผมคือ **myTask AI Copilot** ถามข้อมูลคิวงาน, SLA, คะแนน หรือกดปุ่มไมโครโฟนเพื่อพูดภาษาไทยได้เลยครับ',
      lines: parseReplyLines(
        'สวัสดีครับ ผมคือ **myTask AI Copilot** ถามข้อมูลคิวงาน, SLA, คะแนน หรือกดปุ่มไมโครโฟนเพื่อพูดภาษาไทยได้เลยครับ',
      ),
      ticketIds: [],
      time: nowTimeLabel(),
    },
  ]);

  protected readonly providerLabel = computed(() => {
    const s = this.status();
    if (!s) return 'AI Copilot';
    return s.provider === 'gemini' ? 'Gemini 2.5' : 'Smart Engine';
  });

  protected readonly speechButtonSettings = {
    content: '',
    stopContent: '',
    iconCss: 'e-icons e-audio',
    stopIconCss: 'e-icons e-pause',
    isPrimary: false,
  };

  protected readonly speechTooltipSettings = {
    content: 'พูดคำถามภาษาไทย (Voice)',
    stopContent: 'หยุดฟัง',
  };

  private speechBase = '';
  private statusLoaded = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopSpeaking();
    });
  }

  protected toggleOpen(): void {
    const next = !this.open();
    this.open.set(next);
    if (next && !this.statusLoaded) {
      this.statusLoaded = true;
      void this.loadStatus();
    }
    if (next) {
      this.scrollToBottom();
    } else {
      this.stopSpeaking();
    }
  }

  protected toggleAutoSpeak(): void {
    const next = !this.autoSpeak();
    this.autoSpeak.set(next);
    if (!next) {
      this.stopSpeaking();
    }
  }

  protected clearChat(): void {
    this.stopSpeaking();
    this.messages.set([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        text: 'ล้างประวัติแชตแล้วครับ ถามคำถามใหม่หรือกดปุ่มไมโครโฟนได้เลย',
        lines: parseReplyLines('ล้างประวัติแชตแล้วครับ ถามคำถามใหม่หรือกดปุ่มไมโครโฟนได้เลย'),
        ticketIds: [],
        time: nowTimeLabel(),
      },
    ]);
  }

  protected openTicket(id: string): void {
    if (id) {
      this.ticketDetail.open(id);
    }
  }

  protected onSpeechStart(): void {
    this.speechBase = this.draft();
    this.listening.set(true);
  }

  protected onSpeechChange(args: TranscriptChangedEventArgs): void {
    const spoken = String(args?.transcript ?? '').trim();
    if (!spoken) return;
    this.draft.set(mergeSpeechTranscript(this.speechBase, spoken));
  }

  protected onSpeechStop(): void {
    this.listening.set(false);
    const text = this.draft().trim();
    if (text && text !== this.speechBase.trim()) {
      void this.send(text);
    }
  }

  protected onSpeechError(args: { error?: string } | Event): void {
    this.listening.set(false);
    const code = args && 'error' in args ? args.error : undefined;
    this.notice.warning(speechErrorMessageTh(code));
  }

  protected onComposerKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void this.send();
    }
  }

  protected async send(overrideText?: string): Promise<void> {
    const text = (overrideText ?? this.draft()).trim();
    if (!text || this.sending()) return;

    this.stopSpeaking();
    const userBubble: ChatBubble = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      lines: parseReplyLines(text),
      ticketIds: [],
      time: nowTimeLabel(),
    };
    const history = this.messages()
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    this.messages.update((list) => [...list, userBubble]);
    this.draft.set('');
    this.sending.set(true);
    this.scrollToBottom();

    try {
      const track = this.workspace.track();
      const res = await this.api.chatWithAi({
        message: text,
        history,
        track: track && track !== 'All' ? track : undefined,
      });
      const botBubble: ChatBubble = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: res.reply,
        lines: parseReplyLines(res.reply),
        ticketIds: res.ticketIds ?? [],
        provider: res.provider,
        time: nowTimeLabel(),
      };
      this.messages.update((list) => [...list, botBubble]);
      if (res.suggestions?.length) {
        this.quickPrompts.set(res.suggestions.slice(0, 4));
      }
      if (this.autoSpeak() && this.ttsSupported) {
        this.speakBubble(botBubble);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อผู้ช่วย AI ได้';
      this.messages.update((list) => [
        ...list,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `ขออภัยครับ: ${msg}`,
          lines: parseReplyLines(`ขออภัยครับ: ${msg}`),
          ticketIds: [],
          time: nowTimeLabel(),
        },
      ]);
    } finally {
      this.sending.set(false);
      this.scrollToBottom();
    }
  }

  protected speakBubble(bubble: ChatBubble): void {
    if (!this.ttsSupported) {
      this.notice.warning('เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง (TTS)');
      return;
    }
    if (this.speakingId() === bubble.id) {
      this.stopSpeaking();
      return;
    }
    this.stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(stripForSpeech(bubble.text));
    utterance.lang = 'th-TH';
    utterance.rate = 1.05;
    utterance.onend = () => this.speakingId.set(null);
    utterance.onerror = () => this.speakingId.set(null);
    this.speakingId.set(bubble.id);
    window.speechSynthesis.speak(utterance);
  }

  protected stopSpeaking(): void {
    if (this.ttsSupported) {
      window.speechSynthesis.cancel();
    }
    this.speakingId.set(null);
  }

  private async loadStatus(): Promise<void> {
    try {
      const s = await this.api.getAiStatus();
      this.status.set(s);
    } catch {
      // Ignore silent status error
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesViewport?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 30);
  }
}
