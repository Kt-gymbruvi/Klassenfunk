-- Klassenfunk – Live-Umfragen im Unterricht (Wortwolke, Umfrage, offene Frage, Skala, Rangfolge,
-- 100 Punkte, 2×2-Raster, Fragen der Klasse). Läuft im selben Supabase-Projekt wie Quizzo, mit
-- eigenen Tabellen (Präfix kf_) und demselben Lehrkraft-Konto.
--
-- Datenschutz:
--   * Schüler machen ANONYM mit: nur PIN, kein Name, kein Konto. Gespeichert werden nur ihre Antworten.
--   * Schüler haben keinen Tabellenzugriff, nur die Funktionen kf_beitreten, kf_zustand,
--     kf_antworten, kf_frage_stellen, kf_frage_stimmen (security definer, mit geheimem Token).
--   * Sitzungsdaten (Teilnehmer, Antworten, Fragen der Klasse) werden beim Beenden gelöscht,
--     spätestens nach 6 Stunden automatisch (kf_aufraeumen).
--   * Dauerhaft gespeichert werden nur die Präsentationen der Lehrkraft.
-- Ausführen im Supabase-Dashboard: SQL Editor → New query → Inhalt einfügen → Run.

-- ---------------------------------------------------------------------------
-- Prüfung der Folien
--   auswahl   {optionen: [2..8 Texte], mehrfach: bool}
--   wortwolke {woerter: 1..3}                       (Einsendungen pro Person)
--   offen     {max_zeichen: 20..280, mehrfach: bool}
--   skala     {aussagen: [1..6], links: Text, rechts: Text}   (Stufen 1..5)
--   rangfolge {elemente: [2..8]}
--   punkte    {optionen: [2..8]}                    (100 Punkte verteilen)
--   raster    {elemente: [1..6], x: [links, rechts], y: [unten, oben]}  (Werte 0..10)
--   fragen    {}                                    (Fragen der Klasse)
--   info      {text}                                (Folie ohne Abstimmung)
-- ---------------------------------------------------------------------------
create function public.kf_texte_ok(a jsonb, min_n integer, max_n integer, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a) = 'array'
     and jsonb_array_length(a) between min_n and max_n
     and not exists (
       select 1 from jsonb_array_elements(a) e
       where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and max_len)
$$;

create function public.kf_folie_gueltig(typ text, inhalt jsonb)
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
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Präsentationen der Lehrkraft (dauerhaft)
-- ---------------------------------------------------------------------------
create table public.kf_praesentationen (
  id            uuid primary key default gen_random_uuid(),
  besitzer_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel         text not null check (char_length(titel) between 1 and 200),
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create index kf_praesentationen_besitzer_idx on public.kf_praesentationen (besitzer_id);

create table public.kf_folien (
  id                uuid primary key default gen_random_uuid(),
  praesentation_id  uuid not null references public.kf_praesentationen (id) on delete cascade,
  position          smallint not null check (position >= 0),
  typ               text not null,
  text              text not null check (char_length(text) between 1 and 300),
  inhalt            jsonb not null default '{}',
  check (public.kf_folie_gueltig(typ, inhalt)),
  unique (praesentation_id, position)
);

alter table public.kf_praesentationen enable row level security;
alter table public.kf_folien enable row level security;
revoke all on public.kf_praesentationen, public.kf_folien from anon;
grant select, insert, update, delete on public.kf_praesentationen, public.kf_folien to authenticated;

create policy "Lehrkraft verwaltet eigene Präsentationen" on public.kf_praesentationen
  for all to authenticated
  using (besitzer_id = (select auth.uid()))
  with check (besitzer_id = (select auth.uid()));
create policy "Lehrkraft verwaltet Folien eigener Präsentationen" on public.kf_folien
  for all to authenticated
  using (exists (select 1 from public.kf_praesentationen p where p.id = praesentation_id and p.besitzer_id = (select auth.uid())))
  with check (exists (select 1 from public.kf_praesentationen p where p.id = praesentation_id and p.besitzer_id = (select auth.uid())));

-- Präsentation mit allen Folien in einem Schritt speichern (security invoker: RLS gilt)
create function public.kf_praesentation_speichern(p_id uuid, p_titel text, p_folien jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.kf_praesentationen (titel) values (p_titel) returning id into v_id;
  else
    update public.kf_praesentationen set titel = p_titel, geaendert_am = now() where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'KF: Präsentation nicht gefunden.';
    end if;
    delete from public.kf_folien where praesentation_id = v_id;
  end if;
  insert into public.kf_folien (praesentation_id, position, typ, text, inhalt)
  select v_id, (f.nr - 1)::smallint, f.d ->> 'typ', f.d ->> 'text', coalesce(f.d -> 'inhalt', '{}'::jsonb)
  from jsonb_array_elements(p_folien) with ordinality as f(d, nr);
  return v_id;
end;
$$;
revoke execute on function public.kf_praesentation_speichern(uuid, text, jsonb) from public, anon;
grant execute on function public.kf_praesentation_speichern(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Live-Sitzungen (werden gelöscht)
-- ---------------------------------------------------------------------------
create table public.kf_sitzungen (
  id                   uuid primary key default gen_random_uuid(),
  besitzer_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel                text not null,
  pin                  text not null unique check (pin ~ '^\d{6}$'),
  folien               jsonb not null check (jsonb_typeof(folien) = 'array' and jsonb_array_length(folien) between 1 and 100),
  folie_nr             integer not null default 0,
  abstimmung_offen     boolean not null default true,
  ergebnisse_sichtbar  boolean not null default true,
  erstellt_am          timestamptz not null default now()
);
create index kf_sitzungen_besitzer_idx on public.kf_sitzungen (besitzer_id);

create table public.kf_teilnehmer (
  id          uuid primary key default gen_random_uuid(),
  sitzung_id  uuid not null references public.kf_sitzungen (id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  beigetreten timestamptz not null default now()
);
create index kf_teilnehmer_sitzung_idx on public.kf_teilnehmer (sitzung_id);

create table public.kf_antworten (
  id             bigint generated always as identity primary key,
  sitzung_id     uuid not null references public.kf_sitzungen (id) on delete cascade,
  teilnehmer_id  uuid not null references public.kf_teilnehmer (id) on delete cascade,
  folie_nr       integer not null,
  nr             smallint not null default 0,  -- mehrere Einsendungen (Wortwolke, offene Frage)
  antwort        jsonb not null,
  versteckt      boolean not null default false,
  erstellt_am    timestamptz not null default now(),
  unique (teilnehmer_id, folie_nr, nr)
);
create index kf_antworten_sitzung_idx on public.kf_antworten (sitzung_id, folie_nr);

-- Fragen der Klasse (Q&A)
create table public.kf_fragen (
  id             bigint generated always as identity primary key,
  sitzung_id     uuid not null references public.kf_sitzungen (id) on delete cascade,
  teilnehmer_id  uuid not null references public.kf_teilnehmer (id) on delete cascade,
  folie_nr       integer not null,
  text           text not null check (char_length(text) between 1 and 200),
  versteckt      boolean not null default false,
  beantwortet    boolean not null default false,
  erstellt_am    timestamptz not null default now()
);
create index kf_fragen_sitzung_idx on public.kf_fragen (sitzung_id, folie_nr);
create table public.kf_stimmen (
  frage_id       bigint not null references public.kf_fragen (id) on delete cascade,
  teilnehmer_id  uuid not null references public.kf_teilnehmer (id) on delete cascade,
  primary key (frage_id, teilnehmer_id)
);

alter table public.kf_sitzungen enable row level security;
alter table public.kf_teilnehmer enable row level security;
alter table public.kf_antworten enable row level security;
alter table public.kf_fragen enable row level security;
alter table public.kf_stimmen enable row level security;
revoke all on public.kf_sitzungen, public.kf_teilnehmer, public.kf_antworten, public.kf_fragen, public.kf_stimmen from anon, authenticated;
-- Die Lehrkraft darf eigene Sitzungen lesen und löschen (Löschen entfernt alle Sitzungsdaten).
grant select, delete on public.kf_sitzungen to authenticated;
create policy "Lehrkraft liest eigene Sitzungen" on public.kf_sitzungen
  for select to authenticated using (besitzer_id = (select auth.uid()));
create policy "Lehrkraft beendet eigene Sitzungen" on public.kf_sitzungen
  for delete to authenticated using (besitzer_id = (select auth.uid()));

-- Aufräumen: alles älter als 6 Stunden
create function public.kf_aufraeumen()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.kf_sitzungen where erstellt_am < now() - interval '6 hours';
$$;
revoke execute on function public.kf_aufraeumen() from public, anon, authenticated;

-- Folie ohne Lösungen o. Ä. – in Klassenfunk gibt es keine geheimen Teile, die Folie geht unverändert raus
create function public.kf_folie(s public.kf_sitzungen)
returns jsonb
language sql
stable
set search_path = ''
as $$ select s.folien -> s.folie_nr $$;
revoke execute on function public.kf_folie(public.kf_sitzungen) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lehrkraft
-- ---------------------------------------------------------------------------
create function public.kf_sitzung_starten(p_praesentation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titel  text;
  v_folien jsonb;
  v_pin    text;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'KF: Bitte melde dich an.';
  end if;
  perform public.kf_aufraeumen();
  select titel into v_titel from public.kf_praesentationen where id = p_praesentation and besitzer_id = auth.uid();
  if not found then
    raise exception 'KF: Präsentation nicht gefunden.';
  end if;
  select jsonb_agg(jsonb_build_object('typ', typ, 'text', text, 'inhalt', inhalt) order by position)
    into v_folien from public.kf_folien where praesentation_id = p_praesentation;
  if v_folien is null then
    raise exception 'KF: Die Präsentation hat noch keine Folien.';
  end if;
  loop
    v_pin := lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when v_pin <> '000000' and not exists (select 1 from public.kf_sitzungen where pin = v_pin);
  end loop;
  insert into public.kf_sitzungen (besitzer_id, titel, pin, folien) values (auth.uid(), v_titel, v_pin, v_folien)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'pin', v_pin);
end;
$$;
revoke execute on function public.kf_sitzung_starten(uuid) from public, anon;
grant execute on function public.kf_sitzung_starten(uuid) to authenticated;

-- Folie wechseln, Abstimmung öffnen/schließen, Ergebnisse zeigen/verbergen
create function public.kf_sitzung_steuern(p_sitzung uuid, p_folie_nr integer, p_offen boolean, p_sichtbar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kf_sitzungen
     set folie_nr = greatest(0, least(p_folie_nr, jsonb_array_length(folien) - 1)),
         abstimmung_offen = p_offen, ergebnisse_sichtbar = p_sichtbar
   where id = p_sitzung and besitzer_id = auth.uid();
  if not found then
    raise exception 'KF: Sitzung nicht gefunden.';
  end if;
end;
$$;
revoke execute on function public.kf_sitzung_steuern(uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.kf_sitzung_steuern(uuid, integer, boolean, boolean) to authenticated;

-- Alles, was der Beamer braucht: aktuelle Folie, Teilnehmerzahl, Antworten und Fragen der Klasse
create function public.kf_ergebnisse(p_sitzung uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.kf_sitzungen;
begin
  select * into s from public.kf_sitzungen where id = p_sitzung and besitzer_id = auth.uid();
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', s.id, 'pin', s.pin, 'titel', s.titel, 'folie_nr', s.folie_nr, 'anzahl_folien', jsonb_array_length(s.folien),
    'folie', public.kf_folie(s), 'abstimmung_offen', s.abstimmung_offen, 'ergebnisse_sichtbar', s.ergebnisse_sichtbar,
    'teilnehmer', (select count(*) from public.kf_teilnehmer t where t.sitzung_id = s.id),
    'abgestimmt', (select count(distinct a.teilnehmer_id) from public.kf_antworten a where a.sitzung_id = s.id and a.folie_nr = s.folie_nr),
    'antworten', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'antwort', a.antwort, 'versteckt', a.versteckt) order by a.id)
                  from public.kf_antworten a where a.sitzung_id = s.id and a.folie_nr = s.folie_nr), '[]'::jsonb),
    'fragen', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'text', f.text, 'versteckt', f.versteckt, 'beantwortet', f.beantwortet,
                    'stimmen', (select count(*) from public.kf_stimmen st where st.frage_id = f.id)) order by f.id)
                  from public.kf_fragen f where f.sitzung_id = s.id and f.folie_nr = s.folie_nr), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.kf_ergebnisse(uuid) from public, anon;
grant execute on function public.kf_ergebnisse(uuid) to authenticated;

-- Einzelne Antwort (z. B. ein Wort in der Wortwolke) oder Frage der Klasse ausblenden / als beantwortet markieren
create function public.kf_antwort_ausblenden(p_antwort bigint, p_versteckt boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kf_antworten a set versteckt = p_versteckt
   where a.id = p_antwort and exists (select 1 from public.kf_sitzungen s where s.id = a.sitzung_id and s.besitzer_id = auth.uid());
  if not found then
    raise exception 'KF: Antwort nicht gefunden.';
  end if;
end;
$$;
revoke execute on function public.kf_antwort_ausblenden(bigint, boolean) from public, anon;
grant execute on function public.kf_antwort_ausblenden(bigint, boolean) to authenticated;

create function public.kf_frage_markieren(p_frage bigint, p_versteckt boolean, p_beantwortet boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kf_fragen f set versteckt = p_versteckt, beantwortet = p_beantwortet
   where f.id = p_frage and exists (select 1 from public.kf_sitzungen s where s.id = f.sitzung_id and s.besitzer_id = auth.uid());
  if not found then
    raise exception 'KF: Frage nicht gefunden.';
  end if;
end;
$$;
revoke execute on function public.kf_frage_markieren(bigint, boolean, boolean) from public, anon;
grant execute on function public.kf_frage_markieren(bigint, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Schüler (anonym, ohne Konto)
-- ---------------------------------------------------------------------------
create function public.kf_beitreten(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.kf_sitzungen;
  t public.kf_teilnehmer;
begin
  perform public.kf_aufraeumen();
  select * into s from public.kf_sitzungen where pin = btrim(coalesce(p_pin, ''));
  if not found then
    raise exception 'KF: Unter dieser PIN läuft gerade nichts. Bitte prüfe die Eingabe.';
  end if;
  if (select count(*) from public.kf_teilnehmer where sitzung_id = s.id) >= 300 then
    raise exception 'KF: Die Sitzung ist voll.';
  end if;
  insert into public.kf_teilnehmer (sitzung_id) values (s.id) returning * into t;
  return jsonb_build_object('sitzung_id', s.id, 'teilnehmer_id', t.id, 'token', t.token);
end;
$$;
revoke execute on function public.kf_beitreten(text) from public;
grant execute on function public.kf_beitreten(text) to anon, authenticated;

-- Was das Handy zeigt: aktuelle Folie, eigene Antworten, bei sichtbaren Ergebnissen auch die Fragen der Klasse
create function public.kf_zustand(p_teilnehmer uuid, p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.kf_teilnehmer;
  s public.kf_sitzungen;
begin
  select * into t from public.kf_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    return null;
  end if;
  select * into s from public.kf_sitzungen where id = t.sitzung_id;
  return jsonb_build_object(
    'titel', s.titel, 'folie_nr', s.folie_nr, 'anzahl_folien', jsonb_array_length(s.folien), 'folie', public.kf_folie(s),
    'abstimmung_offen', s.abstimmung_offen,
    'meine', coalesce((select jsonb_agg(a.antwort order by a.nr) from public.kf_antworten a
                       where a.teilnehmer_id = t.id and a.folie_nr = s.folie_nr), '[]'::jsonb),
    'fragen', case when s.folien -> s.folie_nr ->> 'typ' = 'fragen' then coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'text', f.text, 'beantwortet', f.beantwortet,
                 'stimmen', (select count(*) from public.kf_stimmen st where st.frage_id = f.id),
                 'meine_stimme', exists (select 1 from public.kf_stimmen st where st.frage_id = f.id and st.teilnehmer_id = t.id),
                 'von_mir', f.teilnehmer_id = t.id) order by f.id)
        from public.kf_fragen f where f.sitzung_id = s.id and f.folie_nr = s.folie_nr and not f.versteckt), '[]'::jsonb) end
  );
end;
$$;
revoke execute on function public.kf_zustand(uuid, uuid) from public;
grant execute on function public.kf_zustand(uuid, uuid) to anon, authenticated;

-- Ist die Antwort für diese Folie zulässig?
create function public.kf_antwort_gueltig(f jsonb, a jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  i jsonb := f -> 'inhalt';
  n integer;
  summe numeric;
begin
  case f ->> 'typ'
    when 'auswahl' then
      n := jsonb_array_length(i -> 'optionen');
      return jsonb_typeof(a) = 'array' and jsonb_array_length(a) between 1 and (case when (i ->> 'mehrfach')::boolean then n else 1 end)
         and not exists (select 1 from jsonb_array_elements(a) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric not in
                         (select generate_series(0, n - 1)))
         and (select count(distinct e) from jsonb_array_elements(a) e) = jsonb_array_length(a);
    when 'wortwolke' then
      return jsonb_typeof(a) = 'string' and char_length(btrim(a #>> '{}')) between 1 and 25;
    when 'offen' then
      return jsonb_typeof(a) = 'string' and char_length(btrim(a #>> '{}')) between 1 and (i ->> 'max_zeichen')::integer;
    when 'skala' then
      n := jsonb_array_length(i -> 'aussagen');
      return jsonb_typeof(a) = 'array' and jsonb_array_length(a) = n
         and not exists (select 1 from jsonb_array_elements(a) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric not in (1, 2, 3, 4, 5));
    when 'rangfolge' then
      n := jsonb_array_length(i -> 'elemente');
      -- Antwort: Reihenfolge als Liste der Element-Nummern (jede genau einmal)
      return jsonb_typeof(a) = 'array' and jsonb_array_length(a) = n
         and (select count(distinct (e #>> '{}')::numeric) from jsonb_array_elements(a) e
              where jsonb_typeof(e) = 'number' and (e #>> '{}')::numeric in (select generate_series(0, n - 1))) = n;
    when 'punkte' then
      n := jsonb_array_length(i -> 'optionen');
      if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) <> n then return false; end if;
      if exists (select 1 from jsonb_array_elements(a) e where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric < 0
                 or (e #>> '{}')::numeric <> floor((e #>> '{}')::numeric)) then return false; end if;
      select sum((e #>> '{}')::numeric) into summe from jsonb_array_elements(a) e;
      return summe = 100;
    when 'raster' then
      n := jsonb_array_length(i -> 'elemente');
      return jsonb_typeof(a) = 'array' and jsonb_array_length(a) = n
         and not exists (select 1 from jsonb_array_elements(a) e
                         where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
                            or jsonb_typeof(e -> 0) <> 'number' or jsonb_typeof(e -> 1) <> 'number'
                            or (e ->> 0)::numeric not between 0 and 10 or (e ->> 1)::numeric not between 0 and 10);
    else
      return false; -- fragen und info: keine Antworten über diese Funktion
  end case;
end;
$$;
revoke execute on function public.kf_antwort_gueltig(jsonb, jsonb) from public, anon, authenticated;

-- Antworten. Einfache Folien: erneut senden ersetzt die Antwort. Wortwolke/offene Frage (mehrfach): weitere Einsendung.
create function public.kf_antworten(p_teilnehmer uuid, p_token uuid, p_folie_nr integer, p_antwort jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.kf_teilnehmer;
  s public.kf_sitzungen;
  f jsonb;
  v_max integer := 1;
  v_n integer;
begin
  select * into t from public.kf_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    raise exception 'KF: Du bist nicht (mehr) dabei.';
  end if;
  select * into s from public.kf_sitzungen where id = t.sitzung_id;
  if p_folie_nr is distinct from s.folie_nr then
    raise exception 'KF: Diese Folie ist nicht mehr dran.';
  end if;
  if not s.abstimmung_offen then
    raise exception 'KF: Die Abstimmung ist geschlossen.';
  end if;
  f := public.kf_folie(s);
  if not public.kf_antwort_gueltig(f, p_antwort) then
    raise exception 'KF: Diese Antwort passt nicht zur Folie.';
  end if;
  if f ->> 'typ' = 'wortwolke' then
    v_max := (f -> 'inhalt' ->> 'woerter')::integer;
  elsif f ->> 'typ' = 'offen' and (f -> 'inhalt' ->> 'mehrfach')::boolean then
    v_max := 3;
  end if;

  if v_max = 1 then
    insert into public.kf_antworten (sitzung_id, teilnehmer_id, folie_nr, nr, antwort)
      values (s.id, t.id, s.folie_nr, 0, p_antwort)
      on conflict (teilnehmer_id, folie_nr, nr) do update set antwort = excluded.antwort, versteckt = false, erstellt_am = now();
  else
    select count(*) into v_n from public.kf_antworten where teilnehmer_id = t.id and folie_nr = s.folie_nr;
    if v_n >= v_max then
      raise exception 'KF: Du hast schon alles eingeschickt.';
    end if;
    insert into public.kf_antworten (sitzung_id, teilnehmer_id, folie_nr, nr, antwort)
      values (s.id, t.id, s.folie_nr, v_n, to_jsonb(btrim(p_antwort #>> '{}')));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.kf_antworten(uuid, uuid, integer, jsonb) from public;
grant execute on function public.kf_antworten(uuid, uuid, integer, jsonb) to anon, authenticated;

-- Fragen der Klasse: Frage stellen (höchstens 5 pro Person und Folie) und Daumen geben/zurücknehmen
create function public.kf_frage_stellen(p_teilnehmer uuid, p_token uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.kf_teilnehmer;
  s public.kf_sitzungen;
  v_text text := btrim(coalesce(p_text, ''));
begin
  select * into t from public.kf_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    raise exception 'KF: Du bist nicht (mehr) dabei.';
  end if;
  select * into s from public.kf_sitzungen where id = t.sitzung_id;
  if public.kf_folie(s) ->> 'typ' <> 'fragen' or not s.abstimmung_offen then
    raise exception 'KF: Gerade können keine Fragen gestellt werden.';
  end if;
  if char_length(v_text) not between 1 and 200 then
    raise exception 'KF: Die Frage muss 1 bis 200 Zeichen lang sein.';
  end if;
  if (select count(*) from public.kf_fragen where teilnehmer_id = t.id and folie_nr = s.folie_nr) >= 5 then
    raise exception 'KF: Du hast schon 5 Fragen gestellt.';
  end if;
  insert into public.kf_fragen (sitzung_id, teilnehmer_id, folie_nr, text) values (s.id, t.id, s.folie_nr, v_text);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.kf_frage_stellen(uuid, uuid, text) from public;
grant execute on function public.kf_frage_stellen(uuid, uuid, text) to anon, authenticated;

create function public.kf_frage_stimmen(p_teilnehmer uuid, p_token uuid, p_frage bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.kf_teilnehmer;
  v_frage public.kf_fragen;
begin
  select * into t from public.kf_teilnehmer where id = p_teilnehmer and token = p_token;
  if not found then
    raise exception 'KF: Du bist nicht (mehr) dabei.';
  end if;
  select * into v_frage from public.kf_fragen where id = p_frage and sitzung_id = t.sitzung_id and not versteckt;
  if not found then
    raise exception 'KF: Diese Frage gibt es nicht.';
  end if;
  if v_frage.teilnehmer_id = t.id then
    raise exception 'KF: Für die eigene Frage kannst du nicht stimmen.';
  end if;
  delete from public.kf_stimmen where frage_id = p_frage and teilnehmer_id = t.id;
  if not found then
    insert into public.kf_stimmen (frage_id, teilnehmer_id) values (p_frage, t.id);
    return jsonb_build_object('gestimmt', true);
  end if;
  return jsonb_build_object('gestimmt', false);
end;
$$;
revoke execute on function public.kf_frage_stimmen(uuid, uuid, bigint) from public;
grant execute on function public.kf_frage_stimmen(uuid, uuid, bigint) to anon, authenticated;
