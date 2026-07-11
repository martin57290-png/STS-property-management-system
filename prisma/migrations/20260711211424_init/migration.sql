-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LANDLORD', 'TENANT', 'APPLICANT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DENIED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXECUTED', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('MOVE_IN', 'MOVE_OUT');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'PENDING_SIGNATURES', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CHARGE', 'PAYMENT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('RENT', 'LATE_FEE', 'UTILITY', 'DEPOSIT', 'APPLICATION_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ACH', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "WorkOrderCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'PEST', 'NO_HEAT', 'NO_WATER', 'SEWAGE', 'NO_ELECTRICITY', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('EMERGENCY', 'URGENT', 'ROUTINE', 'LOW');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('GOVERNMENT_ID', 'PAY_STUB', 'BANK_STATEMENT', 'LEASE', 'EXECUTED_LEASE', 'DISCLOSURE', 'INSPECTION_PHOTO', 'WORK_ORDER_MEDIA', 'COMPLETION_PHOTO', 'RECEIPT', 'NOTICE', 'CORRESPONDENCE', 'DEPOSIT_DISPOSITION', 'UNIT_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('APPLICATION_RECEIVED', 'APPLICATION_STATUS_CHANGED', 'RENT_DUE_REMINDER', 'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'WORK_ORDER_STATUS_CHANGED', 'LEASE_EXPIRATION', 'INSPECTION_SCHEDULED', 'GENERAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TENANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CA',
    "zip" TEXT NOT NULL,
    "yearBuilt" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" DOUBLE PRECISION NOT NULL,
    "sqft" INTEGER,
    "marketRentCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "applianceInventory" JSONB,
    "photos" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "trackingToken" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "monthlyIncomeCents" INTEGER,
    "moveInDate" TIMESTAMP(3),
    "screeningConsentAt" TIMESTAMP(3),
    "screeningConsentIp" TEXT,
    "screeningConsentName" TEXT,
    "feeCents" INTEGER,
    "feePaidAt" TIMESTAMP(3),
    "feePaymentRef" TEXT,
    "feeReceiptKey" TEXT,
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCoApplicant" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationship" TEXT,
    "isOccupantOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApplicationCoApplicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationResidence" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "monthlyRentCents" INTEGER,
    "moveIn" TIMESTAMP(3),
    "moveOut" TIMESTAMP(3),
    "landlordName" TEXT,
    "landlordPhone" TEXT,
    "landlordEmail" TEXT,
    "reasonForLeaving" TEXT,

    CONSTRAINT "ApplicationResidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEmployment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "employer" TEXT NOT NULL,
    "position" TEXT,
    "monthlyIncomeCents" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "supervisorName" TEXT,
    "supervisorPhone" TEXT,

    CONSTRAINT "ApplicationEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationVehicle" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "color" TEXT,
    "licensePlate" TEXT,
    "state" TEXT,

    CONSTRAINT "ApplicationVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationPet" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "breed" TEXT,
    "name" TEXT,
    "weightLbs" INTEGER,
    "age" INTEGER,
    "isServiceAnimal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApplicationPet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationReference" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "email" TEXT,

    CONSTRAINT "ApplicationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEmergencyContact" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "ApplicationEmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationNote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "TenancyStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "rentCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "rentDueDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenancyTenant" (
    "tenancyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TenancyTenant_pkey" PRIMARY KEY ("tenancyId","userId")
);

-- CreateTable
CREATE TABLE "LeaseTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "templateId" TEXT,
    "applicationId" TEXT,
    "status" "LeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "rentCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "lateFeeCents" INTEGER,
    "lateFeeGraceDays" INTEGER,
    "utilitiesIncluded" JSONB,
    "petTerms" TEXT,
    "petRentCents" INTEGER,
    "additionalTerms" TEXT,
    "disclosures" JSONB,
    "isRenewal" BOOLEAN NOT NULL DEFAULT false,
    "renewedFromId" TEXT,
    "generatedPdfKey" TEXT,
    "executedPdfKey" TEXT,
    "generatedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "tenantAckAt" TIMESTAMP(3),
    "tenantAckName" TEXT,
    "landlordAckAt" TIMESTAMP(3),
    "landlordAckName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "condition" "ItemCondition",
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositDisposition" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "depositCents" INTEGER NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "statementDueDate" TIMESTAMP(3),
    "pdfKey" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositDeduction" (
    "id" TEXT NOT NULL,
    "dispositionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "photoKeys" JSONB,

    CONSTRAINT "DepositDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerId" TEXT,
    "failureReason" TEXT,
    "isAutopay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutopayEnrollment" (
    "id" TEXT NOT NULL,
    "tenancyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "method" "PaymentMethod" NOT NULL DEFAULT 'ACH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopayEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenancyId" TEXT,
    "createdById" TEXT,
    "category" "WorkOrderCategory" NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isHabitability" BOOLEAN NOT NULL DEFAULT false,
    "permissionToEnter" BOOLEAN NOT NULL DEFAULT false,
    "preferredAccessTimes" TEXT,
    "vendorId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "costCents" INTEGER,
    "acknowledgedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderComment" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibleToTenant" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "specialty" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "uploadedById" TEXT,
    "applicationId" TEXT,
    "tenancyId" TEXT,
    "leaseId" TEXT,
    "unitId" TEXT,
    "propertyId" TEXT,
    "workOrderId" TEXT,
    "inspectionItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "event" "NotificationEvent" NOT NULL DEFAULT 'GENERAL',
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prefs" JSONB NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_unitNumber_key" ON "Unit"("propertyId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Application_trackingToken_key" ON "Application"("trackingToken");

-- CreateIndex
CREATE INDEX "Application_unitId_status_idx" ON "Application"("unitId", "status");

-- CreateIndex
CREATE INDEX "Tenancy_unitId_status_idx" ON "Tenancy"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_applicationId_key" ON "Lease"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_renewedFromId_key" ON "Lease"("renewedFromId");

-- CreateIndex
CREATE INDEX "Lease_tenancyId_status_idx" ON "Lease"("tenancyId", "status");

-- CreateIndex
CREATE INDEX "Lease_endDate_idx" ON "Lease"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_tenancyId_type_key" ON "Inspection"("tenancyId", "type");

-- CreateIndex
CREATE INDEX "InspectionItem_inspectionId_room_idx" ON "InspectionItem"("inspectionId", "room");

-- CreateIndex
CREATE UNIQUE INDEX "DepositDisposition_tenancyId_key" ON "DepositDisposition"("tenancyId");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenancyId_effectiveDate_idx" ON "LedgerEntry"("tenancyId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerId_key" ON "Payment"("providerId");

-- CreateIndex
CREATE INDEX "Payment_tenancyId_status_idx" ON "Payment"("tenancyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AutopayEnrollment_tenancyId_userId_key" ON "AutopayEnrollment"("tenancyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_status_priority_idx" ON "WorkOrder"("status", "priority");

-- CreateIndex
CREATE INDEX "WorkOrder_unitId_idx" ON "WorkOrder"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_applicationId_idx" ON "Document"("applicationId");

-- CreateIndex
CREATE INDEX "Document_tenancyId_idx" ON "Document"("tenancyId");

-- CreateIndex
CREATE INDEX "Document_workOrderId_idx" ON "Document"("workOrderId");

-- CreateIndex
CREATE INDEX "Document_inspectionItemId_idx" ON "Document"("inspectionItemId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCoApplicant" ADD CONSTRAINT "ApplicationCoApplicant_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationResidence" ADD CONSTRAINT "ApplicationResidence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEmployment" ADD CONSTRAINT "ApplicationEmployment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationVehicle" ADD CONSTRAINT "ApplicationVehicle_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPet" ADD CONSTRAINT "ApplicationPet_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationReference" ADD CONSTRAINT "ApplicationReference_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEmergencyContact" ADD CONSTRAINT "ApplicationEmergencyContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenancyTenant" ADD CONSTRAINT "TenancyTenant_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenancyTenant" ADD CONSTRAINT "TenancyTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LeaseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItem" ADD CONSTRAINT "InspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositDisposition" ADD CONSTRAINT "DepositDisposition_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositDeduction" ADD CONSTRAINT "DepositDeduction_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "DepositDisposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopayEnrollment" ADD CONSTRAINT "AutopayEnrollment_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopayEnrollment" ADD CONSTRAINT "AutopayEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "InspectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
