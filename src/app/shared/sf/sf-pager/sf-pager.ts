import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PagerModule } from '@syncfusion/ej2-angular-grids';
import { LIST_PAGE_SIZES } from '../sf-grid/sf-grid';

export interface SfPagerChange {
  page: number;
  pageSize: number;
}

let nextPagerId = 1;

@Component({
  selector: 'app-sf-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PagerModule],
  template: `
    <ejs-pager
      [id]="resolvedId()"
      [currentPage]="page()"
      [pageSize]="pageSize()"
      [pageCount]="pageCount()"
      [totalRecordsCount]="total()"
      [pageSizes]="resolvedPageSizes()"
      [enablePagerMessage]="true"
      (click)="onClick($event)"
      (dropDownChanged)="onPageSizeDropdown($event)"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class SfPagerComponent {
  private readonly autoId = `sf-pager-${nextPagerId++}`;

  readonly id = input<string>('');
  readonly page = input<number>(1);
  readonly pageSize = input<number>(12);
  readonly total = input<number>(0);
  readonly pageCount = input<number>(5);
  readonly pageSizes = input<boolean | number[]>(true);

  readonly pageChange = output<SfPagerChange>();

  protected readonly resolvedId = computed(() => this.id() || this.autoId);

  protected readonly resolvedPageSizes = computed(() => {
    const raw = this.pageSizes();
    if (raw === false) return false;
    if (Array.isArray(raw)) return raw;
    return [...LIST_PAGE_SIZES];
  });

  protected onClick(args: { name?: string; currentPage?: number }): void {
    if (args?.name !== 'click') return;
    const nextPage = Math.max(1, Number(args.currentPage) || 1);
    this.pageChange.emit({ page: nextPage, pageSize: this.pageSize() });
  }

  protected onPageSizeDropdown(args: { pageSize?: number }): void {
    const nextSize = Math.max(1, Number(args?.pageSize) || this.pageSize());
    this.pageChange.emit({ page: 1, pageSize: nextSize });
  }
}
