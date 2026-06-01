ALTER DATABASE postgres SET "app.settings.edge_function_url" =
'http://host.docker.internal:54321/functions/v1/enhance';

ALTER DATABASE postgres SET "app.settings.db_webhook_secret" =
'manual-phase-2-secret';

select
  current_setting('app.settings.edge_function_url', true) as edge_function_url,
  current_setting('app.settings.db_webhook_secret', true) as db_webhook_secret;

insert into public.jobs (id, user_id, status, source_path)
values ('d08b99c2-1c31-42c3-981d-600660c4cdc0', '21c6481d-5873-453f-9d1e-54ad6be695d1', 'queued', '21c6481d-5873-453f-9d1e-54ad6be695d1/d08b99c2-1c31-42c3-981d-600660c4cdc0/source.jpg');

delete from public.jobs where user_id = '21c6481d-5873-453f-9d1e-54ad6be695d1';

insert into public.jobs (id, user_id, status, source_path)
values ('b2516d19-32bd-4c3c-9c72-49c3076c5e53', '21c6481d-5873-453f-9d1e-54ad6be695d1', 'queued', '21c6481d-5873-453f-9d1e-54ad6be695d1/b2516d19-32bd-4c3c-9c72-49c3076c5e53/source.jpg');

select id, status, replicate_prediction_id, error_code, error_message
from public.jobs
where id = 'd08b99c2-1c31-42c3-981d-600660c4cdc0';

select id, status, replicate_prediction_id, error_code, error_message
from public.jobs
where id = 'b2516d19-32bd-4c3c-9c72-49c3076c5e53';


ALTER DATABASE postgres SET "app.settings.edge_function_url" =
'http://host.docker.internal:54321/functions/v1/enhance';

ALTER DATABASE postgres SET "app.settings.db_webhook_secret" =
'manual-phase-2-secret';

select
  current_setting('app.settings.edge_function_url', true) as edge_function_url,
  current_setting('app.settings.db_webhook_secret', true) as db_webhook_secret;


insert into public.jobs (id, user_id, status, source_path)
values ('594815ba-7beb-411c-ae0f-1cac016785e3', '21c6481d-5873-453f-9d1e-54ad6be695d1', 'queued', '21c6481d-5873-453f-9d1e-54ad6be695d1/594815ba-7beb-411c-ae0f-1cac016785e3/source.jpg');

select id, status, source_path, result_path, replicate_prediction_id, error_code, error_message, completed_at
from public.jobs
where id = '594815ba-7beb-411c-ae0f-1cac016785e3';


select
  current_setting('app.settings.edge_function_url', true) as edge_function_url,
  current_setting('app.settings.db_webhook_secret', true) as db_webhook_secret;


  select id, status, source_path, result_path, replicate_prediction_id,
       error_code, error_message, created_at, completed_at
from public.jobs
order by created_at desc
limit 5;

select id, status, source_path, result_path, replicate_prediction_id,
       error_code, error_message, completed_at
from public.jobs
where id = 'f4f78c6b-36d4-4ff6-8dcd-b34236e51c00';
