import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService, CatalogItem } from '../../services/user-profile.service';

@Component({
  selector: 'app-catalog-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalog-manager.component.html',
  styleUrls: ['./catalog-manager.component.css']
})
export class CatalogManagerComponent {
  private profileService = inject(UserProfileService);

  profile = this.profileService.profile;
  catalog = computed(() => this.profile().catalog || []);

  activeFilter = signal<'all' | 'demo' | 'completed' | 'released'>('all');

  filteredCatalog = computed(() => {
    const items = this.catalog();
    const filter = this.activeFilter();
    if (filter === 'all') return items;
    return items.filter(item => item.status === filter);
  });

  stats = computed(() => {
    const items = this.catalog();
    return {
      total: items.length,
      demos: items.filter(i => i.status === 'demo').length,
      released: items.filter(i => i.status === 'released').length,
      assets: items.filter(i => i.category !== 'track').length
    };
  });

  async addItem(type: 'track' | 'stem' | 'artwork') {
    const newItem: CatalogItem = {
      id: `item-${Date.now()}`,
      title: type === 'track' ? 'New Master' : type === 'stem' ? 'New Stem' : 'New Artwork',
      status: 'demo',
      category: type,
      url: '',
      metadata: {
        credits: [this.profile().artistName],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedCatalog = [...this.catalog(), newItem];
    await this.profileService.updateProfile({
      ...this.profile(),
      catalog: updatedCatalog
    });
  }

  async updateItem(item: CatalogItem) {
    const updatedCatalog = this.catalog().map(i => i.id === item.id ? { ...item, updatedAt: new Date().toISOString() } : i);
    await this.profileService.updateProfile({
      ...this.profile(),
      catalog: updatedCatalog
    });
  }

  async deleteItem(id: string) {
    const updatedCatalog = this.catalog().filter(i => i.id !== id);
    await this.profileService.updateProfile({
      ...this.profile(),
      catalog: updatedCatalog
    });
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'released': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  }
}
