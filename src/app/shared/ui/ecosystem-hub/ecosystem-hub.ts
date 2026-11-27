import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type EcosystemNodeTone = 'primary' | 'coral' | 'violet' | 'cyan' | 'emerald' | 'amber';
export type EcosystemNodeStatus = 'connected' | 'pending' | 'offline' | 'syncing' | 'active';

export interface EcosystemHubNode {
  id: string;
  label: string;
  sublabel: string;
  tone: EcosystemNodeTone;
  side: 'left' | 'right';
  slot: 0 | 1 | 2;
  icon: 'myproject' | 'gitlab' | 'teams' | 'ai' | 'calendar' | 'qa';
  status?: EcosystemNodeStatus;
  statusText?: string;
}

export const DEFAULT_ECOSYSTEM_NODES: readonly EcosystemHubNode[] = [
  {
    id: 'op-conn',
    label: 'myProject',
    sublabel: 'ใบงาน & SLA อัตโนมัติ',
    tone: 'primary',
    side: 'left',
    slot: 0,
    icon: 'myproject',
    status: 'active',
  },
  {
    id: 'gitlab',
    label: 'GitLab MR',
    sublabel: 'รีวิวโค้ด & Branch',
    tone: 'coral',
    side: 'left',
    slot: 1,
    icon: 'gitlab',
    status: 'active',
  },
  {
    id: 'teams',
    label: 'MS Teams',
    sublabel: 'แจ้งเตือน & Ping SLA',
    tone: 'violet',
    side: 'left',
    slot: 2,
    icon: 'teams',
    status: 'active',
  },
  {
    id: 'ai',
    label: 'AI & OLS',
    sublabel: 'พยากรณ์และโค้ชทีม',
    tone: 'cyan',
    side: 'right',
    slot: 0,
    icon: 'ai',
    status: 'active',
  },
  {
    id: 'calendar',
    label: 'วันลา & โควตา',
    sublabel: 'คำนวณ MD เป็นธรรม',
    tone: 'emerald',
    side: 'right',
    slot: 1,
    icon: 'calendar',
    status: 'active',
  },
  {
    id: 'qa',
    label: 'QA & Snapshot',
    sublabel: 'ตรวจคุณภาพ & ล็อกผล',
    tone: 'amber',
    side: 'right',
    slot: 2,
    icon: 'qa',
    status: 'active',
  },
];

@Component({
  selector: 'app-ecosystem-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ecosystem-hub.html',
  styleUrl: './ecosystem-hub.scss',
})
export class EcosystemHubComponent {
  readonly mode = input<'showcase' | 'live'>('showcase');
  readonly headline = input<string>('รวมทุกเครื่องมือไว้ที่เดียว');
  readonly accentWord = input<string>('ทีมเห็นภาพตรงกัน');
  readonly subtitle = input<string>(
    'myTask เชื่อมใบงาน โค้ด การแจ้งเตือน และเกณฑ์คะแนน Man-day ให้ไหลเวียนอัตโนมัติในพื้นที่เดียว',
  );
  readonly centerLabel = input<string>('ศูนย์กลางการทำงาน');
  readonly centerBrand = input<string>('myTask Hub');
  readonly showHeader = input<boolean>(true);
  readonly frameless = input<boolean>(false);
  readonly showPillars = input<boolean>(true);
  readonly nodes = input<readonly EcosystemHubNode[]>(DEFAULT_ECOSYSTEM_NODES);
  readonly activeNodeId = input<string | null>(null);

  readonly nodeSelect = output<string>();

  protected readonly leftNodes = computed(() =>
    this.nodes()
      .filter((n) => n.side === 'left')
      .sort((a, b) => a.slot - b.slot),
  );

  protected readonly rightNodes = computed(() =>
    this.nodes()
      .filter((n) => n.side === 'right')
      .sort((a, b) => a.slot - b.slot),
  );

  protected onSelectNode(node: EcosystemHubNode): void {
    if (this.mode() === 'live') {
      this.nodeSelect.emit(node.id);
    }
  }

  protected statusLabel(node: EcosystemHubNode): string {
    if (node.statusText) return node.statusText;
    switch (node.status) {
      case 'connected':
        return 'เชื่อมต่อแล้ว';
      case 'syncing':
        return 'กำลังซิงก์';
      case 'pending':
        return 'รอตั้งค่า';
      case 'offline':
        return 'ปิดใช้งาน';
      default:
        return '';
    }
  }
}
