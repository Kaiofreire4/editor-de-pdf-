import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizarPdf } from './organizar-pdf';

describe('OrganizarPdf', () => {
  let component: OrganizarPdf;
  let fixture: ComponentFixture<OrganizarPdf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizarPdf],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizarPdf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
