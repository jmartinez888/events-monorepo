import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import {
  AgreementStatus,
  AttendanceStatus,
  MinuteStatus,
  SessionMode,
  SessionType,
} from "@prisma/client";

export class InstitutionDto {
  @IsUUID() organizationId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) acronym!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() websiteUrl?: string;
  @IsOptional() @IsString() address?: string;
  @IsString() @MinLength(1) principalName!: string;
  @IsEmail() principalEmail!: string;
  @IsOptional() @IsString() principalRole?: string;
  @IsOptional() @IsString() alternateName?: string;
  @IsOptional() @IsEmail() alternateEmail?: string;
  @IsOptional() @IsString() alternateRole?: string;
  @IsOptional() @IsString() designationResolution?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateInstitutionDto extends InstitutionDto {
  @IsOptional() declare organizationId: string;
  @IsOptional() declare name: string;
  @IsOptional() declare acronym: string;
  @IsOptional() declare principalName: string;
  @IsOptional() declare principalEmail: string;
}

export class SessionDto {
  @IsUUID() organizationId!: string;
  @Type(() => Number) @IsInt() @Min(1) sessionNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) year!: number;
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsEnum(SessionType) type?: string;
  @IsOptional() @IsEnum(SessionMode) mode?: string;
  @IsDateString() scheduledDate!: string;
  @IsString() @MinLength(1) startTime!: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() virtualMeetingUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quorumRequired?: number;
  @IsOptional() @IsBoolean() isClosed?: boolean;
}

export class UpdateSessionDto extends SessionDto {
  @IsOptional() declare organizationId: string;
  @IsOptional() declare sessionNumber: number;
  @IsOptional() declare year: number;
  @IsOptional() declare title: string;
  @IsOptional() declare scheduledDate: string;
  @IsOptional() declare startTime: string;
}

export class AgreementDto {
  @IsUUID() sessionId!: string;
  @IsUUID() institutionId!: string;
  @IsString() @MinLength(1) agreementCode!: string;
  @IsString() @MinLength(1) description!: string;
  @IsDateString() deadline!: string;
  @IsOptional() @IsEnum(AgreementStatus) status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() progressNotes?: string;
}

export class UpdateAgreementDto extends AgreementDto {
  @IsOptional() declare sessionId: string;
  @IsOptional() declare institutionId: string;
  @IsOptional() declare agreementCode: string;
  @IsOptional() declare description: string;
  @IsOptional() declare deadline: string;
}

export class AgendaDto {
  @IsString() @MinLength(1) topic!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) orderIndex?: number;
  @IsOptional() @IsString() presenterInstitution?: string;
  @IsOptional() @IsString() presenterName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) durationMinutes?: number;
}

export class AttendanceDto {
  @IsOptional() @IsEnum(AttendanceStatus) status?: string;
  @IsOptional() @IsString() attendeeName?: string;
  @IsOptional() @IsString() notes?: string;
}

export class MinuteDto {
  @IsString() @MinLength(1) minuteCode!: string;
  @IsOptional() @IsEnum(MinuteStatus) status?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() contentHtml?: string;
  @IsOptional() @IsString() generatedPdfUrl?: string;
  @IsOptional() @IsString() signedPdfUrl?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class DocumentDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) fileUrl!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fileSizeBytes?: number;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class EvidenceDto extends DocumentDto {
  @IsOptional() @IsString() fileType?: string;
  @IsOptional() @IsString() uploadedBy?: string;
  @IsOptional() @IsString() notes?: string;
}
