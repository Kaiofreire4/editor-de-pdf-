import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/** Keeps editor screens alive while the user moves between the main tools. */
export class EditorRouteReuseStrategy implements RouteReuseStrategy {
  private readonly routesToKeep = new Set([
    'editar-texto',
    'organizar-pdf',
    'visualizar-pdf',
    'editor-word',
    'conversor',
  ]);
  private readonly handles = new Map<string, DetachedRouteHandle>();

  limpar(): void {
    this.handles.clear();
  }

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.routesToKeep.has(route.routeConfig?.path || '');
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    const path = route.routeConfig?.path;
    if (path) this.handles.set(path, handle);
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path;
    return !!path && this.handles.has(path);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.handles.get(route.routeConfig?.path || '') || null;
  }

  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    current: ActivatedRouteSnapshot,
  ): boolean {
    return future.routeConfig === current.routeConfig;
  }
}
