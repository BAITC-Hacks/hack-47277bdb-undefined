import { Route, Routes } from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";
import { AccountPage, AuthPage, CartPage, CatalogPage, CheckoutPage, ComparePage, ContactsPage, ContentPage, FaqPage, FavoritesPage, HomePage, NewsDetailPage, NewsPage, NotFoundPage, OrderDetailPage, OrdersPage, ProductPage, SearchPage } from "./pages/Pages";
import "./styles/integration.css";

export default function App() {
  return <Routes><Route element={<MainLayout/>}>
    <Route index element={<HomePage/>}/><Route path="catalog" element={<CatalogPage/>}/><Route path="catalog/:categorySlug" element={<CatalogPage/>}/><Route path="product/:slug" element={<ProductPage/>}/><Route path="search" element={<SearchPage/>}/>
    <Route path="favorites" element={<FavoritesPage/>}/><Route path="compare" element={<ComparePage/>}/><Route path="cart" element={<CartPage/>}/><Route path="checkout" element={<CheckoutPage/>}/>
    <Route path="news" element={<NewsPage/>}/><Route path="news/:slug" element={<NewsDetailPage/>}/><Route path="faq" element={<FaqPage/>}/>
    {["delivery-and-payment", "returns-and-exchange", "how-to-order", "online-payment", "installment", "privacy-policy", "b2b"].map((slug) => <Route key={slug} path={slug} element={<ContentPage/>}/>)}
    <Route path="contacts" element={<ContactsPage/>}/><Route path="account" element={<AccountPage/>}/><Route path="account/orders" element={<OrdersPage/>}/><Route path="account/orders/:id" element={<OrderDetailPage/>}/>
    <Route path="login" element={<AuthPage/>}/><Route path="register" element={<AuthPage register/>}/><Route path="*" element={<NotFoundPage/>}/>
  </Route></Routes>;
}
