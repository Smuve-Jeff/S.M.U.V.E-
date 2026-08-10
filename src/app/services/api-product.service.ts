import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_SECURITY_CONFIG } from '../app.security';

/** Product shape returned by the S.M.U.V.E. API. */
export interface ApiProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiProductInput {
  name: string;
  description?: string;
  price: number;
  stock?: number;
  isActive?: boolean;
}

/**
 * Typed client for GET/POST/PUT/DELETE /api/product.
 * Authorization is attached automatically by the auth interceptor; when the
 * API is unreachable the HttpClient throws an HttpErrorResponse with
 * `status === 0` — components can check that to show offline messaging.
 */
@Injectable({ providedIn: 'root' })
export class ApiProductService {
  private http = inject(HttpClient);

  private readonly baseUrl = APP_SECURITY_CONFIG.auth_api_url;

  /** GET /api/product?active=… */
  async listProducts(onlyActive = true): Promise<ApiProduct[]> {
    return firstValueFrom(
      this.http.get<ApiProduct[]>(`${this.baseUrl}/product`, {
        params: { active: onlyActive ? 'true' : 'false' },
      })
    );
  }

  /** GET /api/product/:id */
  async getProduct(id: number): Promise<ApiProduct> {
    return firstValueFrom(
      this.http.get<ApiProduct>(`${this.baseUrl}/product/${id}`)
    );
  }

  /** POST /api/product (requires auth) */
  async createProduct(input: ApiProductInput): Promise<ApiProduct> {
    return firstValueFrom(
      this.http.post<ApiProduct>(`${this.baseUrl}/product`, input)
    );
  }

  /** PUT /api/product/:id (requires ownership or admin) */
  async updateProduct(
    id: number,
    input: Partial<ApiProductInput>
  ): Promise<ApiProduct> {
    return firstValueFrom(
      this.http.put<ApiProduct>(`${this.baseUrl}/product/${id}`, input)
    );
  }

  /** DELETE /api/product/:id (requires ownership or admin) */
  async deleteProduct(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/product/${id}`)
    );
  }
}
