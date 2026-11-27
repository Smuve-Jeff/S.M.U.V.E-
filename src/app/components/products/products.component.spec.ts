import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ProductsComponent } from './products.component';
import {
  ApiProduct,
  ApiProductService,
} from '../../services/api-product.service';
import { AuthService } from '../../services/auth.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';

describe('ProductsComponent vault actions', () => {
  let component: ProductsComponent;
  let fixture: ComponentFixture<ProductsComponent>;
  let dialog: { confirm: jest.Mock };
  let productsApi: {
    listProducts: jest.Mock;
    deleteProduct: jest.Mock;
    createProduct: jest.Mock;
  };

  const product: ApiProduct = {
    id: 7,
    name: 'Vault Tee',
    description: 'Heavyweight cotton',
    price: 30,
    stock: 4,
    isActive: true,
    userId: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    dialog = { confirm: jest.fn().mockResolvedValue(true) };
    productsApi = {
      listProducts: jest.fn().mockResolvedValue([product]),
      deleteProduct: jest.fn().mockResolvedValue(undefined),
      createProduct: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProductsComponent],
      providers: [
        provideRouter([]),
        { provide: ApiProductService, useValue: productsApi },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(true),
            currentUser: signal({ id: 1 }),
          },
        },
        { provide: InteractionDialogService, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('keeps the product when the artist declines the purge', async () => {
    dialog.confirm.mockResolvedValueOnce(false);

    await component.deleteProduct(product);

    expect(dialog.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'PURGE VAULT TEE FROM THE VAULT?',
        confirmLabel: 'Purge item',
        cancelLabel: 'Keep item',
        tone: 'danger',
      }),
    );
    expect(productsApi.deleteProduct).not.toHaveBeenCalled();
    expect(component.products()).toHaveLength(1);
  });

  it('purges once the in-app dialog confirms, without reaching the native one', async () => {
    // A native confirm() freezes the Android WebView, so touching it at all is
    // the defect: the spy throws if any path still asks the browser.
    const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('native confirm() froze the WebView');
    });
    try {
      await component.deleteProduct(product);

      expect(productsApi.deleteProduct).toHaveBeenCalledWith(7);
      expect(component.products()).toEqual([]);
      expect(nativeConfirm).not.toHaveBeenCalled();
    } finally {
      nativeConfirm.mockRestore();
    }
  });

  it('reports a refused delete instead of dropping the row', async () => {
    productsApi.deleteProduct.mockRejectedValueOnce(new Error('offline'));

    await component.deleteProduct(product);

    expect(component.products()).toEqual([product]);
    expect(component.error()).toContain('VAULT OPERATION FAILED');
  });
});
