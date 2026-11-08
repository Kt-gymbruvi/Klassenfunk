-- Klassenfunk – Bild oder YouTube-Video auf der Info-Folie
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.
--
-- Info-Folie: { "text": "…", "medium"?: Medium }
--   Medium = { "art": "bild", "url": "https://…", "pfad"?: "<lehrkraft>/<datei>" }
--          | { "art": "youtube", "id": "<11 Zeichen>", "start"?: Sekunden }
-- Hochgeladene Bilder liegen im eigenen Speicher-Bucket "klassenfunk-medien" (öffentlich lesbar),
-- jede Lehrkraft schreibt nur in ihren eigenen Ordner <auth.uid()>/.
-- Bewusst NICHT im Quizzo-Bucket: Quizzo räumt dort Dateien weg, die in keiner Quizfrage vorkommen.
-- Bilder und Videos erscheinen nur am Beamer, nicht auf den Handys.

create function public.kf_medium_gueltig(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null then
    return true; -- kein Medium
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  case p ->> 'art'
    when 'bild' then
      if jsonb_typeof(p -> 'url') is distinct from 'string'
         or char_length(p ->> 'url') > 1000
         or (p ->> 'url') !~ '^https://[^[:space:]"<>]+$' then
        return false;
      end if;
      if p ? 'pfad' and (jsonb_typeof(p -> 'pfad') <> 'string'
         or (p ->> 'pfad') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
        return false;
      end if;
      return (select count(*) from jsonb_object_keys(p)) <= 3;
    when 'youtube' then
      if jsonb_typeof(p -> 'id') is distinct from 'string' or (p ->> 'id') !~ '^[A-Za-z0-9_-]{11}$' then
        return false;
      end if;
      if p ? 'start' then
        if jsonb_typeof(p -> 'start') <> 'number' then
          return false;
        end if;
        if (p ->> 'start')::numeric not between 0 and 36000 or (p ->> 'start')::numeric <> trunc((p ->> 'start')::numeric) then
          return false;
        end if;
      end if;
      return (select count(*) from jsonb_object_keys(p)) <= 3;
    else
      return false;
  end case;
end;
$$;

-- Folien-Prüfung: Info-Folie darf jetzt ein Medium haben (alles andere wie in kf_001)
create or replace function public.kf_folie_gueltig(typ text, inhalt jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(inhalt) = 'object' and case typ
    when 'auswahl' then public.kf_texte_ok(inhalt -> 'optionen', 2, 8, 120) and jsonb_typeof(inhalt -> 'mehrfach') = 'boolean'
    when 'wortwolke' then jsonb_typeof(inhalt -> 'woerter') = 'number' and (inhalt ->> 'woerter')::numeric in (1, 2, 3)
    when 'offen' then jsonb_typeof(inhalt -> 'max_zeichen') = 'number' and (inhalt ->> 'max_zeichen')::numeric between 20 and 280
                      and jsonb_typeof(inhalt -> 'mehrfach') = 'boolean'
    when 'skala' then public.kf_texte_ok(inhalt -> 'aussagen', 1, 6, 120)
                      and char_length(coalesce(inhalt ->> 'links', '')) between 1 and 40
                      and char_length(coalesce(inhalt ->> 'rechts', '')) between 1 and 40
    when 'rangfolge' then public.kf_texte_ok(inhalt -> 'elemente', 2, 8, 80)
    when 'punkte' then public.kf_texte_ok(inhalt -> 'optionen', 2, 8, 80)
    when 'raster' then public.kf_texte_ok(inhalt -> 'elemente', 1, 6, 60)
                       and public.kf_texte_ok(inhalt -> 'x', 2, 2, 30) and public.kf_texte_ok(inhalt -> 'y', 2, 2, 30)
    when 'fragen' then true
    when 'info' then jsonb_typeof(inhalt -> 'text') = 'string' and char_length(inhalt ->> 'text') <= 1000
                     and public.kf_medium_gueltig(inhalt -> 'medium')
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Speicher für Bilder: öffentlich lesbar, höchstens 10 MB, nur Bildformate
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('klassenfunk-medien', 'klassenfunk-medien', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "klassenfunk_medien_hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'klassenfunk-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "klassenfunk_medien_auflisten" on storage.objects
  for select to authenticated
  using (bucket_id = 'klassenfunk-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "klassenfunk_medien_loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'klassenfunk-medien' and (storage.foldername(name))[1] = (select auth.uid())::text);
