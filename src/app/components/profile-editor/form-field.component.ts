import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-form-field',
  template: `
    <div>
      <label class="block text-sm font-medium text-neutral-300">{{
        label
      }}</label>
      <p class="text-xs text-neutral-500 mb-2">{{ description }}</p>
      <ng-content></ng-content>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class FormFieldComponent {
  @Input() label: string = '';
  @Input() description: string = '';
}
