import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from './api-url';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(apiUrl(path)));
  }
  getBlob(path: string): Promise<Blob> {
    return firstValueFrom(this.http.get(apiUrl(path), { responseType: 'blob' }));
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(apiUrl(path), body));
  }
  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(apiUrl(path), body));
  }
}
