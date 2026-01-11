import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EqPanelComponent } from './eq-panel.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [EqPanelComponent],
  exports: [EqPanelComponent]
})
export class EqPanelModule { }
