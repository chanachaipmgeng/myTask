import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const outputDir = resolve('docs/manual_assets');

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const screens = [
  { name: '01_login.png', url: 'http://127.0.0.1:4200/login', wait: 4000 },
  { name: '02_team_dashboard.png', url: 'http://127.0.0.1:4200/team', wait: 6000 },
  { name: '03_my_workspace.png', url: 'http://127.0.0.1:4200/me', wait: 5000 },
  { name: '04_work_summary.png', url: 'http://127.0.0.1:4200/work/summary', wait: 5000 },
  { name: '05_work_timeline.png', url: 'http://127.0.0.1:4200/work/timeline', wait: 6000 },
  { name: '06_work_backlog.png', url: 'http://127.0.0.1:4200/work/backlog', wait: 5000 },
  { name: '07_work_board.png', url: 'http://127.0.0.1:4200/work/board', wait: 6000 },
  { name: '08_work_list.png', url: 'http://127.0.0.1:4200/work/list', wait: 5000 },
  { name: '09_tickets_scorecard.png', url: 'http://127.0.0.1:4200/tickets', wait: 6000 },
  { name: '10_people_board.png', url: 'http://127.0.0.1:4200/people', wait: 5000 },
  { name: '11_person_detail.png', url: 'http://127.0.0.1:4200/people/paweena', wait: 6000 },
  { name: '12_schedule.png', url: 'http://127.0.0.1:4200/schedule', wait: 6000 },
  { name: '13_ai_tracking.png', url: 'http://127.0.0.1:4200/ai', wait: 5000 },
  { name: '14_analytics.png', url: 'http://127.0.0.1:4200/analytics', wait: 6000 },
  { name: '15_integrations.png', url: 'http://127.0.0.1:4200/integrations', wait: 5000 },
  { name: '16_admin.png', url: 'http://127.0.0.1:4200/admin', wait: 5000 },
  { name: '17_mockup.png', url: 'http://127.0.0.1:4200/mockup', wait: 5000 },
  { name: '20_queue.png', url: 'http://127.0.0.1:4200/queue', wait: 5000 },
  { name: '21_work_handoff.png', url: 'http://127.0.0.1:4200/work/handoff', wait: 6000 },
  { name: '22_quality_audit.png', url: 'http://127.0.0.1:4200/quality/audit', wait: 5000 },
  { name: '23_time_audit.png', url: 'http://127.0.0.1:4200/analytics/time-audit', wait: 5000 },
  { name: '24_tickets_disputes.png', url: 'http://127.0.0.1:4200/tickets/disputes', wait: 5000 },
  { name: '25_snapshot_check.png', url: 'http://127.0.0.1:4200/admin/snapshot-check', wait: 5000 },
  { name: '26_admin_rubrics.png', url: 'http://127.0.0.1:4200/admin/rubrics', wait: 5000 },
];

function capture(screen) {
  const dest = join(outputDir, screen.name);
  console.log(`Capturing ${screen.name} from ${screen.url} (wait ${screen.wait}ms)...`);
  const result = spawnSync(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1600,1050',
    '--hide-scrollbars',
    `--virtual-time-budget=${screen.wait}`,
    `--screenshot=${dest}`,
    screen.url,
  ]);
  
  if (existsSync(dest)) {
    const size = statSync(dest).size;
    console.log(`✅ ${screen.name}: ${(size / 1024).toFixed(1)} KB`);
  } else {
    console.error(`❌ Failed to capture ${screen.name}`);
  }
}

function run() {
  console.log(`Starting real-time capture of ${screens.length} screens via Edge Headless...`);
  for (const s of screens) {
    capture(s);
  }
  console.log('🎉 All screen captures completed!');
}

run();
