import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import {
  CapacitorSqliteAdapter,
  createCapacitorSqliteAdapter,
} from './core/database/capacitor-sqlite.adapter';
import {
  SALE_CATALOG_REPOSITORY,
  SqliteSaleCatalogRepository,
} from './core/catalog/sqlite-sale-catalog.repository';
import {
  PRODUCT_AVAILABILITY_REPOSITORY,
  SqliteProductAvailabilityRepository,
} from './core/catalog/sqlite-product-availability.repository';
import {
  OPEN_JOURNEY_REPOSITORY,
  SqliteOpenJourneyRepository,
} from './core/journey/sqlite-open-journey.repository';
import {
  JOURNEY_OPENING_REPOSITORY,
  SqliteJourneyOpeningRepository,
} from './core/journey/sqlite-journey-opening.repository';
import {
  EXPENSE_FORM_OPTIONS_REPOSITORY,
  SqliteExpenseFormOptionsRepository,
} from './core/expense/sqlite-expense-form-options.repository';
import {
  EXPENSE_REGISTRATION_REPOSITORY,
  SqliteExpenseRegistrationRepository,
} from './core/expense/sqlite-expense-registration.repository';
import {
  CASH_SUMMARY_REPOSITORY,
  SqliteCashSummaryRepository,
} from './core/cash/sqlite-cash-summary.repository';
import {
  JOURNEY_CLOSE_BLOCKERS_REPOSITORY,
  SqliteJourneyCloseBlockersRepository,
} from './core/cash/sqlite-journey-close-blockers.repository';
import {
  JOURNEY_CLOSING_REPOSITORY,
  SqliteJourneyClosingRepository,
} from './core/cash/sqlite-journey-closing.repository';
import { DATABASE_DRIVER } from './core/database/database.types';
import {
  INITIAL_USERS_REPOSITORY,
  SqliteInitialUsersRepository,
} from './core/auth/sqlite-initial-users.repository';
import {
  AUTHENTICATION_REPOSITORY,
  SqliteAuthenticationRepository,
} from './core/auth/sqlite-authentication.repository';
import {
  ADMINISTRATOR_RECOVERY_REPOSITORY,
  SqliteAdministratorRecoveryRepository,
} from './core/auth/sqlite-administrator-recovery.repository';
import { routes } from './app.routes';
import { AuthorizationPolicy } from './domain/auth/authorization-policy';
import { AUTH_FACADE, AuthenticationFacade } from './features/auth/authentication.facade';
import {
  SALE_CATALOG_FACADE,
  SaleCatalogFacade,
} from './features/service-workspace/catalog.facade';
import { JOURNEY_FACADE, JourneyFacade } from './features/service-workspace/journey.facade';
import { EXPENSE_FACADE, ExpenseFacade } from './features/service-workspace/expense.facade';
import {
  JOURNEY_REOPENING_REPOSITORY,
  SqliteJourneyReopeningRepository,
} from './core/journey/sqlite-journey-reopening.repository';
import {
  QUICK_SALE_REPOSITORY,
  SqliteQuickSaleRepository,
} from './core/sale/sqlite-quick-sale.repository';
import {
  QUICK_SALE_FINALIZATION_REPOSITORY,
  SqliteQuickSaleFinalizationRepository,
} from './core/sale/sqlite-quick-sale-finalization.repository';
import {
  PENDING_QUICK_SALES_REPOSITORY,
  SqlitePendingQuickSalesRepository,
} from './core/sale/sqlite-pending-quick-sales.repository';
import {
  QUICK_SALE_CANCELLATION_REPOSITORY,
  SqliteQuickSaleCancellationRepository,
} from './core/sale/sqlite-quick-sale-cancellation.repository';
import {
  QUICK_SALE_HISTORY_REPOSITORY,
  SqliteQuickSaleHistoryRepository,
} from './core/sale/sqlite-quick-sale-history.repository';
import { QUICK_SALE_FACADE, QuickSaleFacade } from './features/service-workspace/quick-sale.facade';
import {
  TABLE_SERVICE_FACADE,
  TableServiceFacade,
} from './features/service-workspace/table-service.facade';
import {
  SERVICE_TABLES_REPOSITORY,
  SqliteServiceTablesRepository,
} from './core/table/sqlite-service-tables.repository';
import {
  TABLE_ACCOUNT_REPOSITORY,
  SqliteTableAccountRepository,
} from './core/table/sqlite-table-account.repository';
import {
  TABLE_ACCOUNT_MANAGEMENT_REPOSITORY,
  SqliteTableAccountManagementRepository,
} from './core/table/sqlite-table-account-management.repository';
import {
  TABLE_ACCOUNT_PAYMENT_REPOSITORY,
  SqliteTableAccountPaymentRepository,
} from './core/table/sqlite-table-account-payment.repository';
import {
  SCHEDULED_ORDERS_REPOSITORY,
  SqliteScheduledOrdersRepository,
} from './core/scheduled-order/sqlite-scheduled-orders.repository';
import {
  SCHEDULED_ORDERS_FACADE,
  ScheduledOrdersFacade,
} from './features/service-workspace/scheduled-orders.facade';
import {
  JOURNEY_REPORT_REPOSITORY,
  SqliteJourneyReportRepository,
} from './core/report/sqlite-journey-report.repository';
import { REPORTS_FACADE, ReportsFacade } from './features/reports/reports.facade';
import {
  ECONOMIC_CORRECTIONS_REPOSITORY,
  SqliteEconomicCorrectionsRepository,
} from './core/correction/sqlite-economic-corrections.repository';
import {
  ECONOMIC_CORRECTIONS_FACADE,
  EconomicCorrectionsFacade,
} from './features/corrections/economic-corrections.facade';
import {
  TABLE_ADMINISTRATION_REPOSITORY,
  SqliteTableAdministrationRepository,
} from './core/table/sqlite-table-administration.repository';
import {
  TABLE_ADMINISTRATION_FACADE,
  TableAdministrationFacade,
} from './features/table-administration/table-administration.facade';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular(),
    provideRouter(routes),
    AuthorizationPolicy,
    AuthenticationFacade,
    { provide: AUTH_FACADE, useExisting: AuthenticationFacade },
    SaleCatalogFacade,
    { provide: SALE_CATALOG_FACADE, useExisting: SaleCatalogFacade },
    JourneyFacade,
    { provide: JOURNEY_FACADE, useExisting: JourneyFacade },
    ExpenseFacade,
    { provide: EXPENSE_FACADE, useExisting: ExpenseFacade },
    QuickSaleFacade,
    { provide: QUICK_SALE_FACADE, useExisting: QuickSaleFacade },
    TableServiceFacade,
    { provide: TABLE_SERVICE_FACADE, useExisting: TableServiceFacade },
    ScheduledOrdersFacade,
    { provide: SCHEDULED_ORDERS_FACADE, useExisting: ScheduledOrdersFacade },
    ReportsFacade,
    { provide: REPORTS_FACADE, useExisting: ReportsFacade },
    EconomicCorrectionsFacade,
    { provide: ECONOMIC_CORRECTIONS_FACADE, useExisting: EconomicCorrectionsFacade },
    TableAdministrationFacade,
    { provide: TABLE_ADMINISTRATION_FACADE, useExisting: TableAdministrationFacade },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: CapacitorSqliteAdapter, useFactory: createCapacitorSqliteAdapter },
    { provide: DATABASE_DRIVER, useExisting: CapacitorSqliteAdapter },
    {
      provide: SALE_CATALOG_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteSaleCatalogRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: PRODUCT_AVAILABILITY_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteProductAvailabilityRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: OPEN_JOURNEY_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteOpenJourneyRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: JOURNEY_OPENING_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteJourneyOpeningRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: JOURNEY_REOPENING_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteJourneyReopeningRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: EXPENSE_FORM_OPTIONS_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteExpenseFormOptionsRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: EXPENSE_REGISTRATION_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteExpenseRegistrationRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: CASH_SUMMARY_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteCashSummaryRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: JOURNEY_CLOSE_BLOCKERS_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteJourneyCloseBlockersRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: JOURNEY_CLOSING_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteJourneyClosingRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: QUICK_SALE_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteQuickSaleRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: QUICK_SALE_FINALIZATION_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteQuickSaleFinalizationRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: PENDING_QUICK_SALES_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqlitePendingQuickSalesRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: QUICK_SALE_CANCELLATION_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteQuickSaleCancellationRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: QUICK_SALE_HISTORY_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteQuickSaleHistoryRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: SERVICE_TABLES_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteServiceTablesRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: TABLE_ADMINISTRATION_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteTableAdministrationRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: TABLE_ACCOUNT_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteTableAccountRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: TABLE_ACCOUNT_MANAGEMENT_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteTableAccountManagementRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: TABLE_ACCOUNT_PAYMENT_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteTableAccountPaymentRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: SCHEDULED_ORDERS_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteScheduledOrdersRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: JOURNEY_REPORT_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteJourneyReportRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: ECONOMIC_CORRECTIONS_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteEconomicCorrectionsRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: INITIAL_USERS_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) => new SqliteInitialUsersRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: AUTHENTICATION_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteAuthenticationRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
    {
      provide: ADMINISTRATOR_RECOVERY_REPOSITORY,
      useFactory: (database: CapacitorSqliteAdapter) =>
        new SqliteAdministratorRecoveryRepository(database),
      deps: [CapacitorSqliteAdapter],
    },
  ],
};
