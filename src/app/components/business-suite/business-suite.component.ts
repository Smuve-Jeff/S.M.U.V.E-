import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { BusinessPipelineService } from '../../services/business-pipeline.service';
import { BusinessPipelineType } from '../../types/business.types';
import { UserContextService } from '../../services/user-context.service';

@Component({
  selector: 'app-business-suite',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './business-suite.component.html',
  styleUrls: ['./business-suite.component.css'],
})
export class BusinessSuiteComponent implements OnInit {
  bizService = inject(BusinessPipelineService);
  router = inject(Router);
  userContext = inject(UserContextService);

  availableModules: {
    type: BusinessPipelineType;
    icon: string;
    description: string;
    color: string;
  }[] = [
    {
      type: 'Merch',
      icon: 'fas fa-tshirt',
      description: 'Design and deploy a professional merchandise line.',
      color: 'brand-primary',
    },
    {
      type: 'Record Label',
      icon: 'fas fa-building',
      description: 'Establish your legal entity and record label operations.',
      color: 'brand-secondary',
    },
    {
      type: 'Website',
      icon: 'fas fa-globe',
      description: 'Build a high-performance fan portal and landing page.',
      color: 'brand-warning',
    },
    {
      type: 'PRO',
      icon: 'fas fa-copyright',
      description: 'Register with BMI/ASCAP and secure your royalties.',
      color: 'brand-danger',
    },
    {
      type: 'Legal',
      icon: 'fas fa-file-contract',
      description: 'AI-generated contracts and split sheets for protection.',
      color: 'brand-info',
    },
  ];

  ngOnInit() {
    this.userContext.setMainViewMode('business-suite');
  }

  async startModule(type: BusinessPipelineType) {
    const name = `Official ${type} Pathway`;
    const id = await this.bizService.initializeModule(type, name);
    this.router.navigate(['/business-pipeline', id]);
  }

  navigateToPipeline(id: string) {
    this.router.navigate(['/business-pipeline', id]);
  }
}
