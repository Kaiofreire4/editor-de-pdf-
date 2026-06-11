import { TestBed } from '@angular/core/testing';

import { PdfManager } from './pdf-manager';

describe('PdfManager', () => {
  let service: PdfManager;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfManager);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
