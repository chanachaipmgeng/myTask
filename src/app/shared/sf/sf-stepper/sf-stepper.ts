import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  StepModel,
  StepType,
  StepperChangedEventArgs,
  StepperModule,
} from '@syncfusion/ej2-angular-navigations';

export interface SfStepperOptions {
  id?: string;
  orientation?: 'horizontal' | 'vertical';
  linear?: boolean;
  readOnly?: boolean;
  labelPosition?: 'Top' | 'Bottom' | 'Start' | 'End';
  stepType?: 'default' | 'indicator' | 'label';
  showTooltip?: boolean;
  minWidth?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-sf-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepperModule],
  template: `
    <div class="sf-stepper-scroll">
      <div class="sf-stepper-inner" [style.min-width]="options().minWidth || null">
        <ejs-stepper
          [id]="options().id ?? ''"
          [steps]="steps()"
          [activeStep]="activeStep()"
          [orientation]="options().orientation ?? 'horizontal'"
          [linear]="options().linear ?? false"
          [readOnly]="options().readOnly ?? false"
          [labelPosition]="options().labelPosition ?? 'Bottom'"
          [stepType]="resolvedStepType()"
          [showTooltip]="options().showTooltip ?? true"
          [cssClass]="options().cssClass ?? ''"
          (stepChanged)="stepChanged.emit($event)"
        ></ejs-stepper>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .sf-stepper-scroll {
      width: 100%;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    :host ::ng-deep .e-stepper .e-step-text {
      white-space: nowrap;
      font-size: 12.5px;
      font-weight: 500;
    }
  `,
})
export class SfStepperComponent {
  readonly steps = input<StepModel[]>([]);
  readonly activeStep = input<number>(0);
  readonly options = input<SfStepperOptions>({});

  readonly stepChanged = output<StepperChangedEventArgs>();

  protected resolvedStepType(): StepType {
    return (this.options().stepType ?? 'default') as unknown as StepType;
  }
}
