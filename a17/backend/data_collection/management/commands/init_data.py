from django.core.management.base import BaseCommand
from data_collection.clickhouse_client import get_clickhouse_client
from data_collection.tasks import import_sample_data


class Command(BaseCommand):
    help = 'Initialize ClickHouse database and import sample data'

    def handle(self, *args, **options):
        self.stdout.write('Initializing ClickHouse database...')
        
        ch_client = get_clickhouse_client()
        ch_client.initialize_database()
        ch_client.initialize_tables()
        
        self.stdout.write(self.style.SUCCESS('Database initialized successfully!'))
        
        self.stdout.write('Importing sample data...')
        result = import_sample_data()
        self.stdout.write(self.style.SUCCESS(f'Imported {result["imported"]} sample records!'))
        
        self.stdout.write('Done!')
