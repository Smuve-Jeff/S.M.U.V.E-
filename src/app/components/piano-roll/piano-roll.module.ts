import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PianoRollComponent } from './piano-roll.component';

@NgModule({
  imports: [CommonModule, PianoRollComponent],
  exports: [PianoRollComponent],
})
export class PianoRollModule {}
