import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ApiProduct,
  ApiProductService,
} from '../../services/api-product.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.css'],
})
export class ProductsComponent implements OnInit {
  private productsApi = inject(ApiProductService);
  private authService = inject(AuthService);

  products = signal<ApiProduct[]>([]);
  isLoading = signal(true);
  error = signal('');
  showCreate = signal(false);
  isSubmitting = signal(false);
  isAuthenticated = this.authService.isAuthenticated;

  form = {
    name: '',
    description: '',
    price: 0,
    stock: 0,
  };

  currentUserId = computed(() => {
    const user = this.authService.currentUser();
    return user ? String(user.id) : null;
  });

  canDelete(product: ApiProduct): boolean {
    const uid = this.currentUserId();
    return !!uid && String(product.userId) === uid;
  }

  async ngOnInit() {
    await this.loadProducts();
  }

  async loadProducts() {
    this.isLoading.set(true);
    this.error.set('');
    try {
      this.products.set(await this.productsApi.listProducts(true));
    } catch {
      this.error.set('UNABLE TO REACH THE VAULT. IS THE API ONLINE?');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleCreate() {
    this.showCreate.update((visible) => !visible);
    this.error.set('');
  }

  async createProduct() {
    if (!this.form.name.trim() || this.form.price <= 0) {
      this.error.set('NAME AND PRICE REQUIRED.');
      return;
    }
    this.isSubmitting.set(true);
    this.error.set('');
    try {
      const created = await this.productsApi.createProduct({
        name: this.form.name.trim(),
        description: this.form.description.trim() || undefined,
        price: this.form.price,
        stock: this.form.stock,
      });
      this.products.update((list) => [created, ...list]);
      this.form = { name: '', description: '', price: 0, stock: 0 };
      this.showCreate.set(false);
    } catch (err) {
      this.error.set(this.authErrorMessage(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteProduct(product: ApiProduct) {
    if (!window.confirm(`PURGE ${product.name.toUpperCase()} FROM THE VAULT?`)) {
      return;
    }
    try {
      await this.productsApi.deleteProduct(product.id);
      this.products.update((list) => list.filter((p) => p.id !== product.id));
    } catch (err) {
      this.error.set(this.authErrorMessage(err));
    }
  }

  private authErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'VAULT OFFLINE. CHECK THE API LINK.';
      if (err.status === 401 || err.status === 403)
        return 'AUTHORIZATION REQUIRED. LOG IN FIRST.';
      if (err.status === 404) return 'ITEM NOT FOUND IN THE VAULT.';
    }
    return 'VAULT OPERATION FAILED. TRY AGAIN.';
  }
}
