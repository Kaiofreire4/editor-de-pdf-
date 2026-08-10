import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizarPdfComponent } from './organizar-pdf';

describe('OrganizarPdfComponent', () => {
  let component: OrganizarPdfComponent;
  let fixture: ComponentFixture<OrganizarPdfComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizarPdfComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizarPdfComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
