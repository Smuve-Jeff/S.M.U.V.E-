import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkingComponent } from './networking.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [NetworkingComponent],
  exports: [NetworkingComponent]
})
export class NetworkingModule { }
