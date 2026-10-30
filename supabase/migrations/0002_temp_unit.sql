-- °C or °F, chosen in settings; null until then (the home time zone decides)
alter table profiles add column temp_unit text check (temp_unit in ('C', 'F'));
