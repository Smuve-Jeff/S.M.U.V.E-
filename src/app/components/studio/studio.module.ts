import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudioComponent } from './studio.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [StudioComponent],
  exports: [StudioComponent]
})
export class StudioModule { }
