import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CommandCenterComponent } from '../command-center/command-center.component';

@Component({
  selector: 'app-career-hub',
  standalone: true,
  imports: [CommonModule, CommandCenterComponent],
  template: '<app-command-center></app-command-center>',
  styles: [':host { display: block; height: 100%; }'],
})
export class CareerHubComponent {}
