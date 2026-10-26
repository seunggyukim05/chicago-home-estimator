"""Check HTTP requests without opening a network connection."""
import io
import json
import unittest
from api.estimate import ROOT, handler, market, today
from dev_server import LocalHandler
from website_model import predict_price


class MemorySocket:
    def __init__(self, request):
        self.input = io.BytesIO(request)
        self.output = io.BytesIO()
    def makefile(self, *args, **kwargs):
        return self.input
    def sendall(self, data):
        self.output.write(data)


def http_request(path, payload=None, static=False):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode() if payload is not None else b''
    method = 'POST' if payload is not None else 'GET'
    raw = f'{method} {path} HTTP/1.0\r\nContent-Length: {len(body)}\r\n\r\n'.encode() + body
    sock = MemorySocket(raw)
    (LocalHandler if static else handler)(sock, ('127.0.0.1', 12345), None)
    head, content = sock.output.getvalue().split(b'\r\n\r\n', 1)
    return int(head.split()[1]), content


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inputs = json.loads((ROOT / 'app_assets/prediction_examples.json').read_text())[0]['inputs']

    def test_static_and_metadata(self):
        for path in ('/', '/styles.css', '/app.js'):
            self.assertEqual(http_request(path, static=True)[0], 200)
        status, body = http_request('/api/estimate')
        self.assertEqual(status, 200)
        self.assertIn(self.inputs['ZIP Code'], json.loads(body)['zip_codes'])

    def test_prediction_matches_model(self):
        expected = predict_price({**self.inputs, 'Valuation Date': today()}, ROOT / 'app_assets')
        status, body = http_request('/api/estimate', self.inputs)
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertAlmostEqual(data['price'], expected)
        self.assertLessEqual(len(data['comparables']), 3)
        self.assertEqual(data['details']['Valuation Date'], today())

    def test_invalid_requests(self):
        for payload in (b'{', [], {}, {**self.inputs, 'ZIP Code': '99999'}, {**self.inputs, 'Bedrooms': -1}):
            with self.subTest(payload=payload):
                self.assertEqual(http_request('/api/estimate', payload)[0], 400)
        self.assertEqual(http_request('/api/estimate', b'x' * 17000)[0], 413)

    def test_market_summary(self):
        summary = market(self.inputs['ZIP Code'])
        self.assertEqual(summary['count'], sum(month['count'] for month in summary['months']))
        status, body = http_request('/api/estimate?view=market')
        self.assertEqual(status, 200)
        self.assertGreater(json.loads(body)['count'], 0)

    def test_cross_zip_comparisons_keep_subject_estimate(self):
        from api.estimate import comparison_counts
        other_zip = next(code for code in comparison_counts() if code != self.inputs['ZIP Code'])
        status, body = http_request('/api/estimate', {
            'view': 'comparisons', 'zip': other_zip, 'details': self.inputs,
        })
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data['original_zip'], self.inputs['ZIP Code'])
        self.assertEqual(data['zip'], other_zip)
        self.assertGreater(len(data['sales']), 0)
        self.assertLessEqual(len(data['sales']), 5)
        self.assertTrue(all(row['zip_code'] == other_zip for row in data['sales']))
        expected = predict_price({**self.inputs, 'Valuation Date': today()}, ROOT / 'app_assets')
        self.assertAlmostEqual(data['estimate'], expected)

    def test_comparison_empty_and_invalid_selections(self):
        status, body = http_request('/api/estimate', {
            'view': 'comparisons', 'zip': '99999', 'details': self.inputs,
        })
        self.assertEqual(status, 400)
        for payload in (
            {'view': 'comparisons', 'zip': 'abc', 'details': self.inputs},
            {'view': 'comparisons', 'zip': '60601', 'details': {}},
        ):
            self.assertEqual(http_request('/api/estimate', payload)[0], 400)

    def test_non_chicago_zip_is_rejected(self):
        from api.estimate import metadata, market_zip_codes
        self.assertNotIn('60016', metadata()['zip_codes'])
        self.assertNotIn('60016', market_zip_codes())
        for payload in ({**self.inputs, 'ZIP Code': '60016'},
                        {'view': 'comparisons', 'zip': '60016', 'details': self.inputs}):
            self.assertEqual(http_request('/api/estimate', payload)[0], 400)
        self.assertEqual(http_request('/api/estimate?view=market&zip=60016')[0], 400)

    def test_zip_list_matches_map_and_does_not_require_public_files(self):
        from api.estimate import market_zip_codes, metadata
        from unittest.mock import patch
        boundaries = json.loads((ROOT / 'public/assets/chicago-zip-boundaries.geojson').read_text())
        expected = {feature['properties']['zip'] for feature in boundaries['features']}
        self.assertEqual(set(market_zip_codes()), expected)
        original_read = type(ROOT).read_text

        def server_only_read(path, *args, **kwargs):
            if 'public' in path.parts:
                raise FileNotFoundError('Public files are not in the function bundle')
            return original_read(path, *args, **kwargs)

        market_zip_codes.cache_clear()
        try:
            with patch.object(type(ROOT), 'read_text', server_only_read):
                self.assertEqual(set(market_zip_codes()), expected)
                self.assertGreater(len(metadata()['zip_codes']), 0)
        finally:
            market_zip_codes.cache_clear()

    def test_source_is_not_public(self):
        self.assertEqual(http_request('/website_model.py', static=True)[0], 404)
        self.assertEqual(http_request('/app_assets/final_model_settings.json', static=True)[0], 404)


if __name__ == '__main__':
    unittest.main()
