import { bootstrapApplication } from '@angular/platform-browser';
import { L10n } from '@syncfusion/ej2-base';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { registerSyncfusionLicense } from './app/core/register-license';

registerSyncfusionLicense();

L10n.load({
  'en-US': {
    kanban: {
      items: 'ใบงาน',
      min: 'ขั้นต่ำ',
      max: 'สูงสุด',
      cardsSelected: 'เลือกการ์ด',
      addTitle: 'เพิ่มใบงาน',
      editTitle: 'แก้ไขใบงาน',
      deleteTitle: 'ลบใบงาน',
      deleteContent: 'ต้องการลบใบงานนี้หรือไม่?',
      save: 'บันทึก',
      delete: 'ลบ',
      cancel: 'ยกเลิก',
      yes: 'ใช่',
      no: 'ไม่',
      close: 'ปิด',
      noCard: 'ยังไม่มีใบงานในสถานะนี้',
      unassigned: 'ยังไม่ระบุผู้รับ',
    },
    grid: {
      EmptyRecord: 'ไม่พบข้อมูลที่ตรงกับเงื่อนไข',
      EmptyDataSourceError: 'ไม่พบข้อมูล',
    },
  },
});

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
