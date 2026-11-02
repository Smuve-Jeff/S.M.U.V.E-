package com.smuve.smuve2;

import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing bridge.
 *
 * The web bundle owns the catalog and entitlement UI; this plugin only performs
 * the store transaction and returns the purchase token. Receipt/entitlement
 * validation belongs on a trusted backend (the token is not a secret and is
 * never trusted by itself).
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "SmuvePlayBilling";

    private BillingClient billingClient;
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases()
            .build();
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String skuId = call.getString("skuId");
        if (skuId == null || skuId.trim().isEmpty()) {
            call.reject("A product id is required.");
            return;
        }
        if (pendingPurchase != null) {
            call.reject("Another Play purchase is already in progress.");
            return;
        }

        pendingPurchase = call;
        withClient(client -> {
            queryProduct(client, skuId, BillingClient.ProductType.INAPP, details -> {
                if (details != null) {
                    launch(client, call, details, BillingClient.ProductType.INAPP);
                    return;
                }
                queryProduct(client, skuId, BillingClient.ProductType.SUBS, subDetails -> {
                    if (subDetails == null) {
                        failPending("That product is not available in Play.");
                        return;
                    }
                    launch(client, call, subDetails, BillingClient.ProductType.SUBS);
                });
            });
        }, call);
    }

    @PluginMethod
    public void restore(PluginCall call) {
        withClient(client -> {
            JSArray purchases = new JSArray();
            queryPurchases(client, BillingClient.ProductType.INAPP, inApp -> {
                appendPurchases(purchases, inApp);
                queryPurchases(client, BillingClient.ProductType.SUBS, subs -> {
                    appendPurchases(purchases, subs);
                    JSObject result = new JSObject();
                    result.put("purchases", purchases);
                    call.resolve(result);
                }, call);
            }, call);
        }, call);
    }

    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.reject("A purchase token is required.");
            return;
        }
        withClient(client -> client.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(),
            result -> {
                JSObject out = new JSObject();
                out.put("ok", result.getResponseCode() == BillingClient.BillingResponseCode.OK);
                call.resolve(out);
            }
        ), call);
    }

    @PluginMethod
    public void isLiveBackend(PluginCall call) {
        JSObject out = new JSObject();
        out.put("live", true);
        call.resolve(out);
    }

    private void queryProduct(
        BillingClient client,
        String skuId,
        String type,
        ProductCallback callback
    ) {
        QueryProductDetailsParams.Product product =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(skuId)
                .setProductType(type)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(product))
            .build();
        client.queryProductDetailsAsync(params, (result, productDetailsList) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                || productDetailsList == null
                || productDetailsList.isEmpty()) {
                callback.onResult(null);
                return;
            }
            callback.onResult(productDetailsList.get(0));
        });
    }

    private void launch(
        BillingClient client,
        PluginCall call,
        ProductDetails details,
        String type
    ) {
        BillingFlowParams.ProductDetailsParams.Builder product =
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details);
        if (BillingClient.ProductType.SUBS.equals(type)) {
            List<ProductDetails.SubscriptionOfferDetails> offers =
                details.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) {
                failPending("This subscription has no available offer.");
                return;
            }
            product.setOfferToken(offers.get(0).getOfferToken());
        }

        BillingFlowParams flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(product.build()))
            .build();
        BillingResult result = client.launchBillingFlow(getActivity(), flow);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            failPending(result.getDebugMessage() == null
                ? "Play could not start the purchase."
                : result.getDebugMessage());
        }
        // Success is delivered asynchronously through onPurchasesUpdated.
    }

    @Override
    public void onPurchasesUpdated(
        @NonNull BillingResult billingResult,
        List<Purchase> purchases
    ) {
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            String message = billingResult.getResponseCode()
                == BillingClient.BillingResponseCode.USER_CANCELED
                ? "purchase-cancelled"
                : billingResult.getDebugMessage() == null
                    ? "Play purchase failed."
                    : billingResult.getDebugMessage();
            failPending(message);
            return;
        }
        if (purchases == null || purchases.isEmpty()) {
            failPending("Play returned no purchase.");
            return;
        }

        Purchase purchase = purchases.get(0);
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            failPending("The purchase is pending completion in Play.");
            return;
        }

        // Entitlements here are permanent (packs, instruments, subscription),
        // so acknowledge rather than consume. A failed acknowledgement is
        // surfaced but does not discard a paid token; the storefront can retry.
        client().acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build(),
            result -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Purchase acknowledgement failed: "
                        + result.getDebugMessage());
                }
                resolvePurchase(purchase);
            }
        );
    }

    private void resolvePurchase(Purchase purchase) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (call == null) return;
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("token", purchase.getPurchaseToken());
        out.put("skuId", purchase.getProducts().isEmpty()
            ? null
            : purchase.getProducts().get(0));
        out.put("qty", Math.max(1, purchase.getQuantity()));
        out.put("acquiredAt", purchase.getPurchaseTime());
        call.resolve(out);
    }

    private void failPending(String message) {
        PluginCall call = pendingPurchase;
        pendingPurchase = null;
        if (call != null) call.reject(message);
    }

    private BillingClient client() {
        return billingClient;
    }

    private void withClient(ClientTask task, PluginCall call) {
        if (billingClient == null) {
            billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases()
                .build();
        }
        if (billingClient.isReady()) {
            task.run(billingClient);
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    task.run(billingClient);
                } else {
                    call.reject(result.getDebugMessage() == null
                        ? "Google Play Billing is unavailable."
                        : result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next operation reconnects; do not fail an in-flight
                // purchase here because Play may still deliver its callback.
            }
        });
    }

    private void queryPurchases(
        BillingClient client,
        String type,
        PurchasesCallback callback,
        PluginCall call
    ) {
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(type).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.getDebugMessage() == null
                        ? "Could not restore Play purchases."
                        : result.getDebugMessage());
                    return;
                }
                callback.onResult(purchases == null
                    ? Collections.emptyList()
                    : purchases);
            }
        );
    }

    private void appendPurchases(JSArray target, List<Purchase> purchases) {
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            List<String> products = purchase.getProducts();
            if (products.isEmpty()) continue;
            JSObject row = new JSObject();
            row.put("skuId", products.get(0));
            row.put("token", purchase.getPurchaseToken());
            row.put("acquiredAt", purchase.getPurchaseTime());
            row.put("qty", Math.max(1, purchase.getQuantity()));
            target.put(row);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
        pendingPurchase = null;
        super.handleOnDestroy();
    }

    private interface ClientTask {
        void run(BillingClient client);
    }

    private interface ProductCallback {
        void onResult(ProductDetails details);
    }

    private interface PurchasesCallback {
        void onResult(List<Purchase> purchases);
    }
}
