// zod'un varsayılan İngilizce hata mesajları yerine Türkçe karşılıklar ("Expected number, received nan" gibi mesajlar
// API'den Android ve web'e aynen gidiyordu). Şemada mesajı açıkça verilmiş kurallar (refine, .min(5, "...")) etkilenmez:
// zod'da şemanın kendi mesajı genel haritadan önce gelir. Paket içe aktarılınca kendiliğinden kurulur (index.ts).
import { z, ZodIssueCode, type ZodErrorMap } from "zod";

const n = (v: number | bigint) => String(v).replace(".", ",");

export const trErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "Bu alan zorunlu" };
      if (issue.expected === "number" || issue.expected === "bigint") return { message: "Sayı girin" };
      if (issue.expected === "date") return { message: "Geçerli bir tarih girin" };
      return { message: "Geçersiz değer" };
    case ZodIssueCode.invalid_enum_value:
      return { message: "Listeden bir seçenek seçin" };
    case ZodIssueCode.too_small:
      if (issue.type === "string") return { message: Number(issue.minimum) <= 1 ? "Bu alan boş olamaz" : `En az ${n(issue.minimum)} karakter olmalı` };
      if (issue.type === "array") return { message: `En az ${n(issue.minimum)} seçim yapın` };
      if (issue.type === "number" || issue.type === "bigint") return { message: issue.inclusive ? `En az ${n(issue.minimum)} olmalı` : `${n(issue.minimum)} değerinden büyük olmalı` };
      return { message: "Değer çok küçük" };
    case ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `En fazla ${n(issue.maximum)} karakter olabilir` };
      if (issue.type === "array") return { message: `En fazla ${n(issue.maximum)} seçim yapılabilir` };
      if (issue.type === "number" || issue.type === "bigint") return { message: issue.inclusive ? `En fazla ${n(issue.maximum)} olabilir` : `${n(issue.maximum)} değerinden küçük olmalı` };
      return { message: "Değer çok büyük" };
    case ZodIssueCode.not_integer:
      return { message: "Tam sayı girin" };
    case ZodIssueCode.invalid_string:
      if (issue.validation === "uuid") return { message: "Geçersiz kimlik" };
      if (issue.validation === "email") return { message: "Geçerli bir e-posta girin" };
      return { message: "Biçim geçersiz" };
    case ZodIssueCode.invalid_date:
      return { message: "Geçerli bir tarih girin" };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Tanınmayan alan: ${issue.keys.join(", ")}` };
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_literal:
      return { message: "Geçersiz değer" };
    default:
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(trErrorMap);
