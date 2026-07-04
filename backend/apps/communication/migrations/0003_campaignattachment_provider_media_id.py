from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('communication', '0002_outboundcampaign_estimated_cost_usd_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='campaignattachment',
            name='provider_media_id',
            field=models.CharField(blank=True, default='', max_length=128, verbose_name='Meta Media ID'),
        ),
    ]
