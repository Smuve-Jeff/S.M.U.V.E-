import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HubComponent } from './hub.component';
import { HubRoutes } from './hub.routes';

@NgModule({
  imports: [CommonModule, RouterModule.forChild(HubRoutes), HubComponent],
})
export class HubModule {}
