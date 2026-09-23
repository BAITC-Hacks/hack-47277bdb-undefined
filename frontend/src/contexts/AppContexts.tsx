import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { authApi } from '../api/auth.api';
import { cartApi } from '../api/cart.api';
import { citiesApi } from '../api/cities.api';
import { comparisonApi } from '../api/comparison.api';
import { favoritesApi } from '../api/favorites.api';
import { AUTH_INVALIDATED_EVENT, extractApiError } from '../api/client';
import type { AuthUser, LoginPayload, RegisterPayload } from '../types/auth.types';
import type { Cart } from '../types/cart.types';
import type { City } from '../types/city.types';
import type { Product } from '../types/product.types';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';

type Language = 'kk' | 'ru';
type LoadState = { loading: boolean; error: string };
type CartValue = LoadState & {
  cart: Cart | null; refresh: () => Promise<void>; add: (id: string, quantity: number) => Promise<void>;
  update: (id: string, quantity: number) => Promise<void>; remove: (id: string) => Promise<void>; clear: () => Promise<void>;
};
const LanguageContext = createContext<{ language: Language; setLanguage: (value: Language) => void } | null>(null);
const CityContext = createContext<(LoadState & { city: string; cities: City[]; setCity: (slug: string) => Promise<void> }) | null>(null);
const AuthContext = createContext<(LoadState & {
  user: AuthUser | null; login: (value: LoginPayload) => Promise<void>; register: (value: RegisterPayload) => Promise<void>;
  logout: () => void; refresh: () => Promise<void>;
}) | null>(null);
const CartContext = createContext<CartValue | null>(null);
const SavedContext = createContext<(LoadState & {
  favorites: Product[]; comparison: Product[]; toggleFavorite: (product: Product) => Promise<void>;
  toggleCompare: (product: Product) => Promise<void>; clearCompare: () => Promise<void>; refresh: () => Promise<void>;
}) | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(readStorage(storageKeys.language) === 'ru' ? 'ru' : 'kk');
  const [city, setCityState] = useState(readStorage(storageKeys.city) || 'almaty');
  const [cities, setCities] = useState<City[]>([]);
  const [cityLoading, setCityLoading] = useState(true);
  const [cityError, setCityError] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState('');
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [comparison, setComparison] = useState<Product[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState('');
  const identityVersion = useRef(0);
  const savedVersion = useRef(0);
  const authVersion = useRef(0);
  const selectedCity = useRef(city);
  const cityRecords = useRef(cities);
  const cartQueue = useRef<Promise<unknown>>(Promise.resolve());
  selectedCity.current = city;
  cityRecords.current = cities;

  const resetIdentityState = useCallback(() => {
    identityVersion.current += 1;
    savedVersion.current += 1;
    setCart(null); setFavorites([]); setComparison([]);
    setCartError(''); setSavedError('');
  }, []);

  const logout = useCallback(() => {
    authVersion.current += 1;
    writeStorage(storageKeys.token, '');
    resetIdentityState();
    setUser(null); setAuthLoading(false); setAuthError('');
  }, [resetIdentityState]);

  const refreshAuth = useCallback(async () => {
    const version = ++authVersion.current;
    if (!readStorage(storageKeys.token)) { setUser(null); setAuthLoading(false); return; }
    setAuthLoading(true);
    try {
      const result = await authApi.me();
      if (version === authVersion.current) { setUser(result); setAuthError(''); }
    } catch (error) {
      if (version === authVersion.current) setAuthError(extractApiError(error));
      throw error;
    } finally {
      if (version === authVersion.current) setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    const invalidate = () => { logout(); setAuthError('Сессия мерзімі аяқталды. Жүйеге қайта кіріңіз.'); };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === storageKeys.token) {
        resetIdentityState();
        setUser(null);
        if (event.newValue) void refreshAuth().catch(() => undefined);
        else logout();
      }
    };
    window.addEventListener(AUTH_INVALIDATED_EVENT, invalidate);
    window.addEventListener('storage', storageChanged);
    void refreshAuth().catch(() => undefined);
    return () => {
      window.removeEventListener(AUTH_INVALIDATED_EVENT, invalidate);
      window.removeEventListener('storage', storageChanged);
    };
  }, [logout, refreshAuth, resetIdentityState]);

  useEffect(() => {
    let active = true;
    setCityLoading(true); setCityError('');
    citiesApi.list().then((result) => {
      if (!active) return;
      setCities(result); cityRecords.current = result;
      if (!result.some((item) => item.slug === selectedCity.current)) {
        const fallback = result.find((item) => item.slug === 'almaty')?.slug || result[0]?.slug || 'almaty';
        selectedCity.current = fallback; setCityState(fallback); writeStorage(storageKeys.city, fallback);
      }
    }).catch((error) => { if (active) setCityError(extractApiError(error)); })
      .finally(() => { if (active) setCityLoading(false); });
    return () => { active = false; };
  }, [language]);

  // Serialize city changes/cart mutations, so rapid clicks cannot update the
  // wrong city or let an older response overwrite the latest cart in the UI.
  const runCart = useCallback((operation: (guard: () => void) => Promise<Cart>): Promise<void> => {
    const version = identityVersion.current;
    const guard = () => {
      if (version !== identityVersion.current) throw new Error('Сессия өзгерді. Әрекетті қайталап көріңіз.');
    };
    const task = cartQueue.current.catch(() => undefined).then(async () => {
      guard();
      setCartLoading(true); setCartError('');
      try {
        const result = await operation(guard);
        if (version === identityVersion.current) setCart(result);
      } catch (error) {
        if (version === identityVersion.current) setCartError(extractApiError(error));
        throw error;
      } finally {
        if (version === identityVersion.current) setCartLoading(false);
      }
    });
    cartQueue.current = task;
    return task;
  }, []);

  const readCityCart = useCallback(async (create: boolean): Promise<Cart> => {
    const version = identityVersion.current;
    const current = await cartApi.get();
    if (version !== identityVersion.current) throw new Error('Сессия өзгерді. Әрекетті қайталап көріңіз.');
    const target = cityRecords.current.find((item) => item.slug === selectedCity.current);
    if (!target) {
      if (create) throw new Error('Қаланы жүктеу аяқталғаннан кейін қайталап көріңіз.');
      return current;
    }
    if ((current.id || create) && current.city?.id !== target.id) {
      const result = await cartApi.setCity(target.id);
      if (version !== identityVersion.current) throw new Error('Сессия өзгерді. Әрекетті қайталап көріңіз.');
      return result;
    }
    return current;
  }, []);

  const refreshCart = useCallback(() => runCart(() => readCityCart(false)), [runCart, readCityCart]);

  const refreshSaved = useCallback(async () => {
    const version = ++savedVersion.current;
    setSavedLoading(true); setSavedError('');
    try {
      const [nextFavorites, nextComparison] = await Promise.all([
        user ? favoritesApi.list(selectedCity.current) : Promise.resolve([]),
        comparisonApi.list(selectedCity.current),
      ]);
      if (version === savedVersion.current) { setFavorites(nextFavorites); setComparison(nextComparison); }
    } catch (error) {
      if (version === savedVersion.current) setSavedError(extractApiError(error));
      throw error;
    } finally {
      if (version === savedVersion.current) setSavedLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || cityLoading) return;
    void refreshCart().catch(() => undefined);
    void refreshSaved().catch(() => undefined);
  }, [authLoading, cityLoading, user?.id, city, language, refreshCart, refreshSaved]);

  const authenticate = async (payload: LoginPayload | RegisterPayload, registering: boolean) => {
    const version = ++authVersion.current;
    setAuthLoading(true); setAuthError('');
    try {
      const session = registering ? await authApi.register(payload as RegisterPayload) : await authApi.login(payload);
      if (version !== authVersion.current) return;
      writeStorage(storageKeys.token, session.token);
      resetIdentityState(); setUser(session.user);
    } catch (error) {
      if (version === authVersion.current) setAuthError(extractApiError(error));
      throw error;
    } finally {
      if (version === authVersion.current) setAuthLoading(false);
    }
  };

  const cartValue: CartValue = {
    cart, loading: cartLoading || authLoading, error: cartError, refresh: refreshCart,
    add: (productId, quantity) => runCart(async (guard) => { await readCityCart(true); guard(); return cartApi.addItem({ productId, quantity }); }),
    update: (itemId, quantity) => runCart(async (guard) => { await readCityCart(false); guard(); return cartApi.updateItem(itemId, quantity); }),
    remove: (itemId) => runCart(() => cartApi.removeItem(itemId)),
    clear: () => runCart(async (guard) => { await cartApi.clear(); guard(); return cartApi.get(); }),
  };
  const savedAction = async (operation: () => Promise<unknown>) => {
    const version = identityVersion.current;
    setSavedError('');
    try {
      await operation();
      if (version !== identityVersion.current) throw new Error('Сессия өзгерді. Тізім қайта жүктеледі.');
      await refreshSaved();
    } catch (error) {
      if (version === identityVersion.current) setSavedError(extractApiError(error));
      throw error;
    }
  };
  const saved = {
    favorites, comparison, loading: savedLoading || authLoading, error: savedError, refresh: refreshSaved,
    toggleFavorite: (product: Product) => savedAction(async () => {
      if (!user) throw new Error('Таңдаулылар үшін алдымен жүйеге кіріңіз.');
      if (favorites.some((item) => item.id === product.id)) await favoritesApi.remove(product.id);
      else await favoritesApi.add(product.id);
    }),
    toggleCompare: (product: Product) => savedAction(async () => {
      if (comparison.some((item) => item.id === product.id)) await comparisonApi.remove(product.id);
      else await comparisonApi.add(product.id);
    }),
    clearCompare: () => savedAction(() => comparisonApi.clear()),
  };
  const setCity = async (slug: string) => {
    if (!cities.some((item) => item.slug === slug)) throw new Error('Қала табылмады.');
    selectedCity.current = slug; writeStorage(storageKeys.city, slug); setCityState(slug);
  };
  const setLanguage = (value: Language) => { writeStorage(storageKeys.language, value); setLanguageState(value); };
  const auth = { user, loading: authLoading, error: authError, refresh: refreshAuth, logout,
    login: (value: LoginPayload) => authenticate(value, false), register: (value: RegisterPayload) => authenticate(value, true) };
  return <LanguageContext.Provider value={{ language, setLanguage }}>
    <CityContext.Provider value={{ city, cities, setCity, loading: cityLoading, error: cityError }}>
      <AuthContext.Provider value={auth}><CartContext.Provider value={cartValue}>
        <SavedContext.Provider value={saved}>{children}</SavedContext.Provider>
      </CartContext.Provider></AuthContext.Provider>
    </CityContext.Provider>
  </LanguageContext.Provider>;
}

function required<T>(value: T | null, name: string): T { if (!value) throw new Error(`${name} missing`); return value; }
export const useLanguage = () => required(useContext(LanguageContext), 'LanguageContext');
export const useCity = () => required(useContext(CityContext), 'CityContext');
export const useAuth = () => required(useContext(AuthContext), 'AuthContext');
export const useCart = () => required(useContext(CartContext), 'CartContext');
export const useSaved = () => required(useContext(SavedContext), 'SavedContext');
