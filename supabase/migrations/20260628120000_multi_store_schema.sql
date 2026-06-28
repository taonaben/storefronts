-- Multi-store ownership, public ordering, short links, and product image limits.

create table if not exists public.owner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_profiles enable row level security;

drop policy if exists "Owners can read own profile" on public.owner_profiles;
drop policy if exists "Owners can insert own profile" on public.owner_profiles;
drop policy if exists "Owners can update own profile" on public.owner_profiles;

create policy "Owners can read own profile" on public.owner_profiles
  for select using (auth.uid() = user_id);

create policy "Owners can insert own profile" on public.owner_profiles
  for insert with check (auth.uid() = user_id);

create policy "Owners can update own profile" on public.owner_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  order_notification_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;

create index if not exists stores_owner_id_idx on public.stores(owner_id);
create index if not exists stores_active_slug_idx on public.stores(active, slug);

create or replace function public.is_store_owner(_store_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores
    where stores.id = _store_id
      and stores.owner_id = _user_id
  )
$$;

create or replace function public.ensure_store_owner_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.stores
    where owner_id = new.owner_id
      and id <> new.id
  ) >= 3 then
    raise exception 'store limit reached: each user can create up to 3 stores';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_store_owner_limit on public.stores;
create trigger enforce_store_owner_limit
before insert on public.stores
for each row execute function public.ensure_store_owner_limit();

drop policy if exists "Public read active stores" on public.stores;
drop policy if exists "Owners read own stores" on public.stores;
drop policy if exists "Owners create own stores" on public.stores;
drop policy if exists "Owners update own stores" on public.stores;
drop policy if exists "Owners delete own stores" on public.stores;

create policy "Public read active stores" on public.stores
  for select using (active = true);

create policy "Owners read own stores" on public.stores
  for select using (auth.uid() = owner_id);

create policy "Owners create own stores" on public.stores
  for insert with check (auth.uid() = owner_id);

create policy "Owners update own stores" on public.stores
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Owners delete own stores" on public.stores
  for delete using (auth.uid() = owner_id);

alter table public.categories add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.products add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.delivery_zones add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.orders add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.orders add column if not exists email text;

do $$
declare
  default_owner_id uuid;
  default_store_id uuid;
  has_existing_store_data boolean;
begin
  select user_id
  into default_owner_id
  from public.user_roles
  where role = 'admin'
  order by id
  limit 1;

  if default_owner_id is null then
    select id
    into default_owner_id
    from auth.users
    order by created_at
    limit 1;
  end if;

  select exists(select 1 from public.categories where store_id is null)
    or exists(select 1 from public.products where store_id is null)
    or exists(select 1 from public.delivery_zones where store_id is null)
    or exists(select 1 from public.orders where store_id is null)
  into has_existing_store_data;

  if has_existing_store_data and default_owner_id is null then
    raise exception 'cannot backfill existing store data because no auth user or admin user exists';
  end if;

  if default_owner_id is not null then
    insert into public.owner_profiles (user_id, email)
    select default_owner_id, users.email
    from auth.users
    where users.id = default_owner_id
    on conflict (user_id) do nothing;

    insert into public.stores (owner_id, name, slug, order_notification_phone)
    values (
      default_owner_id,
      'Default Store',
      'default-store',
      (select phone from public.owner_profiles where user_id = default_owner_id)
    )
    on conflict (slug) do update set slug = excluded.slug
    returning id into default_store_id;

    update public.categories set store_id = default_store_id where store_id is null;
    update public.products set store_id = default_store_id where store_id is null;
    update public.delivery_zones set store_id = default_store_id where store_id is null;
    update public.orders set store_id = default_store_id where store_id is null;
  end if;
end;
$$;

update public.orders set email = '' where email is null;

alter table public.categories alter column store_id set not null;
alter table public.products alter column store_id set not null;
alter table public.delivery_zones alter column store_id set not null;
alter table public.orders alter column store_id set not null;
alter table public.orders alter column email set not null;

alter table public.categories drop constraint if exists categories_slug_key;
alter table public.categories add constraint categories_store_slug_key unique (store_id, slug);
alter table public.categories add constraint categories_id_store_id_key unique (id, store_id);

create or replace function public.ensure_product_category_matches_store()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1
    from public.categories
    where categories.id = new.category_id
      and categories.store_id = new.store_id
  ) then
    raise exception 'product category must belong to the same store as the product';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_product_category_store on public.products;
create trigger enforce_product_category_store
before insert or update of category_id, store_id on public.products
for each row execute function public.ensure_product_category_matches_store();

create index if not exists categories_store_id_idx on public.categories(store_id);
create index if not exists products_store_id_idx on public.products(store_id);
create index if not exists products_store_created_at_idx on public.products(store_id, created_at desc);
create index if not exists delivery_zones_store_id_idx on public.delivery_zones(store_id);
create index if not exists orders_store_created_at_idx on public.orders(store_id, created_at desc);

drop policy if exists "Categories are publicly readable" on public.categories;
drop policy if exists "Admins can manage categories" on public.categories;
drop policy if exists "Products are publicly readable" on public.products;
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Delivery zones are publicly readable" on public.delivery_zones;
drop policy if exists "Admins can manage delivery_zones" on public.delivery_zones;
drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Admins can manage orders" on public.orders;
drop policy if exists "Product sizes are publicly readable" on public.product_sizes;
drop policy if exists "Admins can manage product sizes" on public.product_sizes;
drop policy if exists "Public read product_images" on public.product_images;
drop policy if exists "Admins manage product_images" on public.product_images;

create policy "Public read categories for active stores" on public.categories
  for select using (exists (
    select 1 from public.stores
    where stores.id = categories.store_id
      and stores.active = true
  ));

create policy "Owners manage categories" on public.categories
  for all using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "Public read products for active stores" on public.products
  for select using (exists (
    select 1 from public.stores
    where stores.id = products.store_id
      and stores.active = true
  ));

create policy "Owners manage products" on public.products
  for all using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "Public read active delivery zones" on public.delivery_zones
  for select using (
    active = true
    and exists (
      select 1 from public.stores
      where stores.id = delivery_zones.store_id
        and stores.active = true
    )
  );

create policy "Owners manage delivery zones" on public.delivery_zones
  for all using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "Anyone can create orders for active stores" on public.orders
  for insert with check (exists (
    select 1 from public.stores
    where stores.id = orders.store_id
      and stores.active = true
  ));

create policy "Owners read own store orders" on public.orders
  for select using (public.is_store_owner(store_id));

create policy "Owners update own store orders" on public.orders
  for update using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy "Public read product sizes for active stores" on public.product_sizes
  for select using (exists (
    select 1
    from public.products
    join public.stores on stores.id = products.store_id
    where products.id = product_sizes.product_id
      and stores.active = true
  ));

create policy "Owners manage product sizes" on public.product_sizes
  for all using (exists (
    select 1
    from public.products
    where products.id = product_sizes.product_id
      and public.is_store_owner(products.store_id)
  ))
  with check (exists (
    select 1
    from public.products
    where products.id = product_sizes.product_id
      and public.is_store_owner(products.store_id)
  ));

create policy "Public read product images for active stores" on public.product_images
  for select using (exists (
    select 1
    from public.products
    join public.stores on stores.id = products.store_id
    where products.id = product_images.product_id
      and stores.active = true
  ));

create policy "Owners manage product images" on public.product_images
  for all using (exists (
    select 1
    from public.products
    where products.id = product_images.product_id
      and public.is_store_owner(products.store_id)
  ))
  with check (exists (
    select 1
    from public.products
    where products.id = product_images.product_id
      and public.is_store_owner(products.store_id)
  ));

create or replace function public.ensure_product_gallery_image_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.product_images
    where product_id = new.product_id
      and id <> new.id
  ) >= 3 then
    raise exception 'product image limit reached: each product can have 1 cover image and up to 3 gallery images';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_product_gallery_image_limit on public.product_images;
create trigger enforce_product_gallery_image_limit
before insert or update of product_id on public.product_images
for each row execute function public.ensure_product_gallery_image_limit();

with ranked_images as (
  select
    id,
    row_number() over (partition by product_id order by sort_order, created_at, id) - 1 as next_sort_order
  from public.product_images
)
update public.product_images
set sort_order = ranked_images.next_sort_order
from ranked_images
where ranked_images.id = product_images.id;

alter table public.product_images add constraint product_images_product_sort_order_key unique (product_id, sort_order);

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null unique,
  target_type text not null,
  target_id uuid,
  long_path text not null,
  click_count bigint not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint short_links_target_type_check check (target_type in ('store', 'product', 'category'))
);

alter table public.short_links enable row level security;

create index if not exists short_links_store_id_idx on public.short_links(store_id);
create index if not exists short_links_active_code_idx on public.short_links(active, code);

create policy "Owners manage short links" on public.short_links
  for all using (auth.uid() = owner_id and public.is_store_owner(store_id))
  with check (auth.uid() = owner_id and public.is_store_owner(store_id));

create trigger update_owner_profiles_updated_at
before update on public.owner_profiles
for each row execute function public.update_updated_at_column();

create trigger update_stores_updated_at
before update on public.stores
for each row execute function public.update_updated_at_column();

drop policy if exists "Product images are publicly accessible" on storage.objects;
drop policy if exists "Admins can upload product images" on storage.objects;
drop policy if exists "Admins can update product images" on storage.objects;
drop policy if exists "Admins can delete product images" on storage.objects;

create or replace function public.storage_object_store_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);

  if array_length(folders, 1) < 2 or folders[1] <> 'stores' then
    return null;
  end if;

  return folders[2]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create policy "Product images are publicly accessible" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "Store owners can upload product images" on storage.objects
  for insert with check (
    bucket_id = 'product-images'
    and public.is_store_owner(public.storage_object_store_id(name))
  );

create policy "Store owners can update product images" on storage.objects
  for update using (
    bucket_id = 'product-images'
    and public.is_store_owner(public.storage_object_store_id(name))
  )
  with check (
    bucket_id = 'product-images'
    and public.is_store_owner(public.storage_object_store_id(name))
  );

create policy "Store owners can delete product images" on storage.objects
  for delete using (
    bucket_id = 'product-images'
    and public.is_store_owner(public.storage_object_store_id(name))
  );
