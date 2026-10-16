
-- Shared helpers
create or replace function public.fb_guard_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.user_id := old.user_id;            -- ownership is immutable
  if new.updated_at < old.updated_at then -- never let an older write replace a newer one
    return null;
  end if;
  return new;
end $$;

-- PROFILES (preferences)
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  onboarded boolean not null default false,
  genres text[] not null default '{progressive-house,melodic-techno}',
  energy text not null default 'medium' check (energy in ('low','medium','high')),
  vocals text not null default 'instrumental' check (vocals in ('instrumental','vocal','any')),
  session_minutes int not null default 25 check (session_minutes between 1 and 180),
  break_minutes int not null default 5 check (break_minutes between 1 and 60),
  animations boolean not null default true,
  reduced_motion boolean not null default false,
  reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint genres_valid check (genres <@ array['progressive-house','melodic-techno','trance','instrumental-edm','high-energy','calm-electronic']::text[])
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile delete" on public.profiles for delete to authenticated using (auth.uid() = user_id);
create trigger profiles_guard before update on public.profiles for each row execute function public.fb_guard_update();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, updated_at) values (new.id, 'epoch') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- TASKS
create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  title text not null check (char_length(title) between 1 and 500),
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  deadline date,
  done boolean not null default false,
  completed_at timestamptz,
  position int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_position on public.tasks (user_id, position);
create index tasks_user_updated on public.tasks (user_id, updated_at);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "own tasks select" on public.tasks for select to authenticated using (auth.uid() = user_id);
create policy "own tasks insert" on public.tasks for insert to authenticated with check (auth.uid() = user_id);
create policy "own tasks update" on public.tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks delete" on public.tasks for delete to authenticated using (auth.uid() = user_id);
create trigger tasks_guard before update on public.tasks for each row execute function public.fb_guard_update();

-- TASK STEPS
create table public.task_steps (
  id uuid primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  title text not null check (char_length(title) between 1 and 500),
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index task_steps_task on public.task_steps (task_id, position);
create index task_steps_user on public.task_steps (user_id);
grant select, insert, update, delete on public.task_steps to authenticated;
grant all on public.task_steps to service_role;
alter table public.task_steps enable row level security;
create policy "own steps select" on public.task_steps for select to authenticated using (auth.uid() = user_id);
create policy "own steps insert" on public.task_steps for insert to authenticated
  with check (auth.uid() = user_id and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));
create policy "own steps update" on public.task_steps for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));
create policy "own steps delete" on public.task_steps for delete to authenticated using (auth.uid() = user_id);

-- FOCUS SESSION RECORDS
create table public.focus_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  focused_sec int not null check (focused_sec between 0 and 86400),
  interruptions int not null default 0 check (interruptions between 0 and 10000),
  completed_timer boolean not null default false,
  helpful boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index focus_sessions_user_ended on public.focus_sessions (user_id, ended_at desc);
grant select, insert, update, delete on public.focus_sessions to authenticated;
grant all on public.focus_sessions to service_role;
alter table public.focus_sessions enable row level security;
create policy "own sessions select" on public.focus_sessions for select to authenticated using (auth.uid() = user_id);
create policy "own sessions insert" on public.focus_sessions for insert to authenticated
  with check (auth.uid() = user_id and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())));
create policy "own sessions update" on public.focus_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions delete" on public.focus_sessions for delete to authenticated using (auth.uid() = user_id);

-- STEP COMPLETION EVENTS (progress)
create table public.step_events (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  at timestamptz not null default now()
);
create index step_events_user_at on public.step_events (user_id, at desc);
grant select, insert, delete on public.step_events to authenticated;
grant all on public.step_events to service_role;
alter table public.step_events enable row level security;
create policy "own events select" on public.step_events for select to authenticated using (auth.uid() = user_id);
create policy "own events insert" on public.step_events for insert to authenticated with check (auth.uid() = user_id);
create policy "own events delete" on public.step_events for delete to authenticated using (auth.uid() = user_id);

-- MUSIC FEEDBACK
create table public.music_feedback (
  user_id uuid not null default auth.uid(),
  track_id text not null check (char_length(track_id) between 1 and 100),
  kind text not null check (kind in ('like','dislike')),
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
grant select, insert, update, delete on public.music_feedback to authenticated;
grant all on public.music_feedback to service_role;
alter table public.music_feedback enable row level security;
create policy "own feedback all" on public.music_feedback for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ACTIVE (UNFINISHED) TIMER, one per user
create table public.active_sessions (
  user_id uuid primary key default auth.uid(),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.active_sessions to authenticated;
grant all on public.active_sessions to service_role;
alter table public.active_sessions enable row level security;
create policy "own active all" on public.active_sessions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger active_guard before update on public.active_sessions for each row execute function public.fb_guard_update();

-- Atomic task + steps write with newest-wins conflict check. Runs as the caller (RLS applies).
create or replace function public.sync_task(p jsonb)
returns text language plpgsql security invoker set search_path = public as $$
declare
  t_id uuid := (p->>'id')::uuid;
  inc timestamptz := (p->>'updated_at')::timestamptz;
  cur timestamptz;
  step_ids uuid[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select updated_at into cur from tasks where id = t_id;
  if found and cur > inc then return 'stale'; end if;

  insert into tasks (id, user_id, title, priority, deadline, done, completed_at, position, deleted_at, created_at, updated_at)
  values (t_id, auth.uid(), p->>'title', coalesce(p->>'priority','medium'), nullif(p->>'deadline','')::date,
          coalesce((p->>'done')::boolean,false), (p->>'completed_at')::timestamptz, coalesce((p->>'position')::int,0),
          (p->>'deleted_at')::timestamptz, coalesce((p->>'created_at')::timestamptz, now()), inc)
  on conflict (id) do update set title = excluded.title, priority = excluded.priority, deadline = excluded.deadline,
    done = excluded.done, completed_at = excluded.completed_at, position = excluded.position,
    deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;

  if (p->>'deleted_at') is not null then
    delete from task_steps where task_id = t_id;
    return 'ok';
  end if;

  select coalesce(array_agg((s->>'id')::uuid), '{}') into step_ids from jsonb_array_elements(coalesce(p->'steps','[]'::jsonb)) s;
  delete from task_steps where task_id = t_id and not (id = any(step_ids));
  insert into task_steps (id, task_id, user_id, title, done, position, updated_at)
  select (s->>'id')::uuid, t_id, auth.uid(), s->>'title', coalesce((s->>'done')::boolean,false), (o - 1)::int, inc
  from jsonb_array_elements(coalesce(p->'steps','[]'::jsonb)) with ordinality as x(s, o)
  on conflict (id) do update set title = excluded.title, done = excluded.done, position = excluded.position, updated_at = excluded.updated_at
  where task_steps.task_id = t_id;
  return 'ok';
end $$;
revoke all on function public.sync_task(jsonb) from public, anon;
grant execute on function public.sync_task(jsonb) to authenticated;
