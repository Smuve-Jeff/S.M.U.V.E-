import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DjDeckComponent } from './dj-deck.component';

@NgModule({
  imports: [CommonModule, DjDeckComponent],
  exports: [DjDeckComponent],
})
export class DjDeckModule {}
