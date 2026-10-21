-- quiz-maker 그림 저장소 (설계서 2.6절). schema_version 4.
-- 버킷 정의는 이 SQL 한 곳에만 둔다(config.toml 의 [storage.buckets] 에는 두지 않음).
-- 운영에 적용된 뒤에는 이 파일을 고치지 않는다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 10485760,
        array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 올리기만 허용: 프로필이 있는(계정 준비가 끝난) 익명 아닌 사용자가 자기 uid 폴더에만.
-- 덮어쓰기·지우기는 두지 않는다(이름은 매번 새로 만듦). 공개 버킷이라 읽기는 공개 주소로 된다.
-- 앱은 upsert:false 로 올린다. upsert 나 INSERT … RETURNING 을 쓰는 길은 SELECT·UPDATE 정책이 없어 막힌다.
-- 실제 Storage API 로 한 장 올리기가 되는지는 운영 적용 때 확인하고, 막히면 새 파일로 자기 폴더 SELECT 정책을 더한다.
drop policy if exists qm_images_insert_own on storage.objects;
create policy qm_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images'
              and (storage.foldername(name))[1] = (select auth.uid()::text)
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
              and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

update public.qm_settings set schema_version = greatest(schema_version, 4);
