import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ArpeggiatorComponent } from './arpeggiator.component';

const routes: Routes = [{ path: '', component: ArpeggiatorComponent }];

@NgModule({
  imports: [CommonModule, RouterModule.forChild(routes), ArpeggiatorComponent],
})
export class ArpeggiatorModule {}
