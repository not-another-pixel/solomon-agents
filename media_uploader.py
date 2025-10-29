import requests
import json
from threading import RLock
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass
from typing import List
import time
from io import BytesIO
from google.cloud import storage

CACHE_EXPIRY = 10 * 60
MAX_WORKERS = 10
BUCKET_NAME = "facebook-ads-media-sources"
STORAGE_CLIENT = storage.Client()


@dataclass
class VideoData:
    video_id: str


@dataclass
class AssetFeedSpec:
    images: List[dict]
    videos: List[dict]


@dataclass
class ObjectStorySpec:
    page_id: str
    instagram_user_id: str
    video_data: VideoData


@dataclass
class Creative:
    object_story_id: str
    object_story_spec: ObjectStorySpec
    asset_feed_spec: AssetFeedSpec
    video_id: str
    image_hash: str
    image_url: str
    effective_instagram_media_id: str

    @classmethod
    def from_dict(cls, data: dict) -> "Creative":
        return cls(
            object_story_id=data.get("object_story_id"),
            object_story_spec=ObjectStorySpec(
                page_id=data.get("object_story_spec", {}).get("page_id"),
                instagram_user_id=data.get("object_story_spec", {}).get(
                    "instagram_user_id"
                ),
                video_data=VideoData(
                    video_id=data.get("object_story_spec", {})
                    .get("video_data", {})
                    .get("video_id"),
                ),
            ),
            asset_feed_spec=AssetFeedSpec(
                images=data.get("asset_feed_spec", {}).get("images", []),
                videos=data.get("asset_feed_spec", {}).get("videos", []),
            ),
            video_id=data.get("video_id"),
            image_hash=data.get("image_hash"),
            image_url=data.get("image_url"),
            effective_instagram_media_id=data.get("effective_instagram_media_id"),
        )


class Result:
    def __init__(self, company_id: str, ad_id: str, source: str):
        self.company_id = company_id
        self.ad_id = ad_id
        self.source = source

        self.bucket = STORAGE_CLIENT.bucket(BUCKET_NAME)
        self.blob = self.bucket.blob(f"{self.company_id}/{self.ad_id}")

    @property
    def exists(self) -> bool:
        return self.blob.exists()

    def upload_to_gcs(self) -> str | None:
        if self.source:
            if self.exists:
                print(f"Skipping {self.blob.name} because it already exists")
                return self.blob.name

            response = requests.get(self.source)
            if response.status_code == 200:
                file = BytesIO(response.content)
                file.name = self.blob.name
                file.seek(0)

                self.blob.upload_from_file(file)
                print(f"Uploaded {file.name} to {self.blob.name}")

                return file.name

        return None


class Cache:
    def __init__(self):
        self.__cache = {}
        self.__lock = RLock()
        self.__expiry = CACHE_EXPIRY
        self.__last_clean = time.time()

    def get(self, key: str) -> str | None:
        with self.__lock:
            return self.__cache.get(key)

    def set(self, key: str, value: str):
        with self.__lock:
            if time.time() - self.__last_clean > self.__expiry:
                self.__cache = {}
                self.__last_clean = time.time()

            self.__cache[key] = value


class MediaCrawler:
    def __init__(self, version: int, access_token: str):
        self.__access_token = access_token
        self.__version = version
        self.__cache = Cache()

    def crawl(self, account_id: str, creative: Creative) -> str | None:
        # * Anúncio criado a partir de um post existente (imagem e vídeo) | SOLVED SINGLE
        if creative.object_story_id:
            print(f"Crawling {creative.object_story_id} through object story ID")
            page_id = creative.object_story_id.split("_")[0]
            page_token = self.__cache.get(page_id)

            if not page_token:
                page_token = self.__get_page_token(page_id)
                if page_token:
                    self.__cache.set(page_id, page_token)

            if page_token:
                source = self.__get_source_from_object_story_spec(
                    creative.object_story_id, page_token
                )
                if source:
                    print(f"Crawled through object story ID")
                    return source

        # * Anúncio criado junto com o post (vídeo) | SOLVED SINGLE
        if creative.object_story_spec.video_data.video_id:
            print(
                f"Crawling {creative.object_story_spec.video_data.video_id} through object story video ID"
            )
            page_id = creative.object_story_spec.page_id
            if page_id:
                page_token = self.__cache.get(page_id)
                if not page_token:
                    page_token = self.__get_page_token(page_id)
                    if page_token:
                        self.__cache.set(page_id, page_token)

                if page_token:
                    source = self.__get_source_from_video_id(
                        creative.object_story_spec.video_data.video_id, page_token
                    )
                    if source:
                        print(f"Crawled through object story video ID")
                        return source

            source = self.__get_source_from_video_id(
                creative.object_story_spec.video_data.video_id
            )
            if source:
                print(f"Crawled through object story video ID")
                return source

        # * Anúncio criado a partir de um vídeo | SOLVED SINGLE
        if creative.video_id:
            print(f"Crawling {creative.video_id} through video ID")
            page_id = creative.object_story_spec.page_id
            page_token = self.__cache.get(page_id)

            if not page_token:
                page_token = self.__get_page_token(page_id)
                if page_token:
                    self.__cache.set(page_id, page_token)

            if page_token:
                source = self.__get_source_from_video_id(creative.video_id, page_token)
                if source:
                    print(f"Crawled through video ID")
                    return source

            source = self.__get_source_from_video_id(creative.video_id)
            if source:
                print(f"Crawled through video ID")
                return source

        # * Vídeos dinâmicos
        if len(creative.asset_feed_spec.videos) > 0:
            print(f"Crawling {creative.asset_feed_spec.videos} through Video ID")
            for video in creative.asset_feed_spec.videos:
                source = self.__get_source_from_video_id(video.get("video_id"))
                if source:
                    print(f"Crawled through asset feed video ID")
                    return source

            source = self.__get_source_from_video_id(
                creative.object_story_spec.video_data.video_id
            )
            if source:
                print(f"Crawled through asset feed video ID")
                return source

        # * Imagens dinâmicas
        if len(creative.asset_feed_spec.images) > 0:
            print(f"Crawling {creative.asset_feed_spec.images} through Image ID")
            source = self.__get_image_from_hashes(
                account_id,
                list(map(lambda x: x.get("hash"), creative.asset_feed_spec.images)),
            )
            if source:
                return source

        # * Anúncio criado junto com o post (imagem) | SOLVED SINGLE
        if creative.image_url:
            print(f"Crawled {creative.image_url} through Image URL")
            return creative.image_url

        # * Anúncios de colab (partnership)
        if creative.effective_instagram_media_id:
            print(
                f"Crawling {creative.effective_instagram_media_id} through IG Media ID"
            )
            source = self.__get_source_from_ig_media_id(
                creative.effective_instagram_media_id
            )
            if source:
                print(
                    f"Crawled {creative.effective_instagram_media_id} through IG Media ID"
                )
                return source

        print(f"Failed to crawl {creative.object_story_id}")
        return None

    def __get_page_token(self, page_id: str) -> str | None:
        url = f"https://graph.facebook.com/v{self.__version}.0/me/accounts"
        params = {
            "access_token": self.__access_token,
            "limit": "100",
        }
        response = requests.get(url, params=params)
        data = response.json()

        for item in data["data"]:
            if item["id"] == page_id:
                return item["access_token"]

        return None

    def __get_source_from_video_id(
        self, video_id: str, page_token: str | None = None
    ) -> str | None:
        if page_token is None:
            access_token = self.__access_token
        else:
            access_token = page_token

        url = f"https://graph.facebook.com/v{self.__version}.0/{video_id}"
        params = {
            "access_token": access_token,
            "fields": "source",
        }
        response = requests.get(url, params=params)
        data = response.json()

        return data.get("source")

    def __get_source_from_object_story_spec(
        self, object_story_id: str, page_token: str
    ) -> str | None:
        url = f"https://graph.facebook.com/v{self.__version}.0/{object_story_id}"
        params = {
            "access_token": page_token,
            "fields": "attachments",
        }
        response = requests.get(url, params=params)
        data = response.json()

        attachments = data.get("attachments", {})
        attachments_data = attachments.get("data", [])

        for attachment in attachments_data:
            if attachment.get("media", {}).get("source"):
                return attachment.get("media", {}).get("source")

        return None

    def __get_source_from_ig_media_id(self, ig_media_id: str) -> str | None:
        url = f"https://graph.facebook.com/v{self.__version}.0/{ig_media_id}"
        params = {
            "access_token": self.__access_token,
            "fields": "media_url",
        }
        response = requests.get(url, params=params)
        data = response.json()

        return data.get("media_url")

    def __get_image_from_hashes(self, account_id: str, hashes: List[str]) -> str | None:
        url = f"https://graph.facebook.com/v{self.__version}.0/{account_id}/adimages"
        params = {
            "access_token": self.__access_token,
            "hashes": json.dumps(hashes),
        }
        response = requests.get(url, params=params)
        data = response.json()

        for item in data.get("data", []):
            permalink = item.get("permalink_url")
            if permalink:
                return permalink

        return None


class ThreadedMediaCrawler(MediaCrawler):
    def __init__(self, version: int, access_token: str):
        super().__init__(version, access_token)
        self.__thread_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self.__futures: dict[str, Future[str | None]] = {}

    def crawl(
        self, company_id: str, account_id: str, ad_id: str, creative: Creative
    ) -> str | None:
        future = self.__thread_pool.submit(super().crawl, account_id, creative)
        self.__futures[f"{company_id}/{ad_id}"] = future
        return future

    def get_results(self) -> List[Result]:
        results = []
        for key, future in self.__futures.items():
            company_id, ad_id = key.split("/")
            results.append(Result(company_id, ad_id, future.result()))
        return results

    def get_results_with_timeout(self, timeout: int) -> List[Result]:
        results = []
        for key, future in self.__futures.items():
            company_id, ad_id = key.split("/")
            results.append(Result(company_id, ad_id, future.result(timeout=timeout)))
        return results


########################################################################################
# * CLI
########################################################################################

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from typing import List


def parse_arguments():
    parser = argparse.ArgumentParser(description="CLI for media uploading")
    parser.add_argument(
        "--access-token", required=True, help="Access token for authentication"
    )
    parser.add_argument("--company-id", required=True, help="Company ID")
    parser.add_argument("--account-id", required=True, help="Account ID")
    parser.add_argument(
        "--workers", type=int, default=5, help="Number of worker threads"
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="JSON file containing ad IDs")
    group.add_argument("--ad-ids", nargs="+", help="List of ad IDs")

    return parser.parse_args()


def load_ad_ids(file_path: str) -> List[str]:
    with open(file_path, "r") as file:
        data = json.load(file)
    return [item.get("ad_id") for item in data]


def retrieve_ad(ad_id: str, access_token: str) -> dict:
    url = f"https://graph.facebook.com/v23.0/{ad_id}"
    params = {
        "access_token": access_token,
        "fields": "id,adcreatives{id,object_story_id,object_story_spec,asset_feed_spec,video_id,image_hash,image_url,effective_instagram_media_id}",
    }
    response = requests.get(url, params=params)
    return response.json()


def main():
    args = parse_arguments()
    ad_ids = args.ad_ids or load_ad_ids(args.file)

    media_crawler = ThreadedMediaCrawler(args.workers, args.access_token)
    ads = [retrieve_ad(ad_id, args.access_token) for ad_id in ad_ids]

    for ad_data in ads:
        adcreative_data = ad_data.get("adcreatives", {}).get("data", [])
        for adcreative in adcreative_data:
            creative = Creative.from_dict(adcreative)
            media_crawler.crawl(
                args.company_id, args.account_id, ad_data.get("id"), creative
            )

    results = media_crawler.get_results()

    for result in results:
        result.upload_to_gcs()


if __name__ == "__main__":
    main()

# TODO: Flag de formato no Postgres > ~/solomon-app/dataflow/lib/facebook_ads
# * Single Image
# * Single Video
# * Carousel === !!adcreative.object_story_spec.child_attachments
# * Flexible === !!ad.creative_asset_groups_spec
# * Collection === !!adcreative.product_set_id


# * Existing
# * Video / Image

# * Created
# * Static
# * Image
# * Video
# ! Colab (Image / Video)
# ! Dynamic
# * Image
# * Video
