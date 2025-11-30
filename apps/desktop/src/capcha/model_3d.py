import cv2
import numpy as np
from sklearn.decomposition import PCA
from sklearn.cluster import DBSCAN

class CaptchaParsing():
    """3D形状验证码破解"""

    def __init__(self, patch_size=32, img_size=224):
        self.patch_size = patch_size
        self.img_size = img_size
        self.offset = self.get_offset()

    def show_img(self, img, centers):
        # box中心可视化
        for (xc, yc) in centers:
            h, w = img.shape[:2]
            # xc = int(xc*w)
            # yc = int(yc*h)
            img = cv2.circle(img, (xc, yc), 10, (0, 255, 0), 3)
        cv2.imwrite("images/captcha.jpg", img)
        print("save result to {}".format("images/captcha.jpg"))
        # 在窗口cs中显示图片
        cv2.namedWindow("cs")  # 创建一个窗口，名称cs
        cv2.imshow("cs", img)  # 在窗口cs中显示图片
        cv2.waitKey(100)
        cv2.destroyAllWindows()

    def detect_instance(self, source, offset, img_size=224):
        # 获取所有实例的box
        img = cv2.resize(source, (img_size, img_size))

        data = np.reshape(img, (-1, 3))
        backgroud = (data[:, 0] < 256) * (data[:, 0] > 180) \
                    * (data[:, 1] < 256) * (data[:, 1] > 180) \
                    * (data[:, 2] < 256) * (data[:, 2] > 180)

        data = np.concatenate([data, offset], -1)
        data = data[np.where(1 - backgroud)]

        data2 = np.reshape(img, (-1, 3))
        data2[np.where(backgroud)] = np.array([0, 0, 0])
        data2 = np.reshape(data2, (img_size, img_size, 3))

        # 生成随机簇类数据
        data3 = data.copy()
        data3[:, -2:] = data3[:, -2:] * 10
        dbscan = DBSCAN(eps=25, min_samples=5)
        #     dbscan= KMeans(n_clusters=10)
        cluster = dbscan.fit(data3)

        boxes = []
        for i in set(cluster.labels_):
            if i != -1:
                data_tem = data[cluster.labels_ == i]
                xmin = np.min(data_tem[:, -2])
                xmax = np.max(data_tem[:, -2])
                ymin = np.min(data_tem[:, -1])
                ymax = np.max(data_tem[:, -1])
                h_, w_ = ymax - ymin, xmax - xmin
                if (ymax - ymin) * (xmax - xmin) / (224 * 224) > 0.9:
                    continue
                if max(h_, w_) < 10:
                    continue
                if xmax > xmin and ymax > ymin:
                    boxes.append([xmin / img_size, ymin / img_size, xmax / img_size, ymax / img_size])
        return boxes

    def read_img(self, source, box, size=32, norm=False):
        # 读取图片并进行预处理

        xmin, ymin, xmax, ymax = box
        h, w = source.shape[:2]

        data = np.reshape(source, (-1, 3))
        backgroud = (data[:, 0] < 256) * (data[:, 0] > 180) \
                    * (data[:, 1] < 256) * (data[:, 1] > 180) \
                    * (data[:, 2] < 256) * (data[:, 2] > 180)

        data[np.where(backgroud)] = np.array([0, 0, 0])
        source = np.reshape(data, (h, w, 3))

        xmin = int(xmin * w)
        ymin = int(ymin * h)
        xmax = int(xmax * w)
        ymax = int(ymax * h)
        img = source[ymin:ymax, xmin:xmax]
        if min(img.shape[:2]) < 25:
            return None
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img[img > 10] = 255
        img[img <= 10] = 0
        img = cv2.resize(img, (size, size))
        if norm:
            img = (img.flatten() - 127.5) / 127.5
            img = img / np.sum(img ** 2)

        return img

    def get_offset(self, ):
        offset_x = np.tile(np.arange(0, self.img_size).reshape(1, 1, self.img_size), [1, self.img_size, 1])
        offset_y = np.tile(np.arange(0, self.img_size).reshape(1, self.img_size, 1), [1, 1, self.img_size])
        offset = np.concatenate([offset_x, offset_y], 0)
        offset = np.transpose(offset, [1, 2, 0]).reshape(-1, 2)
        return offset

    def get_patch_imgs(self, img, boxes):
        ret_imgs = []
        for box in boxes:
            tem = self.read_img(img, box, size=self.patch_size, norm=True)
            if tem is not None:
                ret_imgs.append(tem)
        return ret_imgs

    def seperate_features(self, X):
        pca = PCA(n_components=4)
        features = pca.fit_transform(X)
        del pca
        return features

    def get_best_value(self, features):
        best_match_value = 10
        best_match = []
        for i in range(len(features) - 1):
            for j in range(i + 1, len(features)):
                value = np.sum((features[i] - features[j]) ** 2)
                if value < best_match_value:
                    best_match = [i, j]
                    best_match_value = value
        return best_match

    def get_center_coordinate(self, box):
        xmin, ymin, xmax, ymax = box
        return (xmin + xmax) / 2, (ymin + ymax) / 2

    def transfer_coordinate_format(self, center, size):
        xmin, ymin = center
        xmin = int(xmin * size[1])
        ymin = int(ymin * size[0])
        return [xmin, ymin]

    def run(self, img):
        # 功能函数
        img = img.astype("uint8")[:, :, :3]
        size = img.shape[:2]
        boxes = self.detect_instance(img, self.offset)
        patch_imgs = self.get_patch_imgs(img, boxes)
        features = self.seperate_features(patch_imgs)
        match_index = self.get_best_value(features)
        centers = [self.get_center_coordinate(boxes[i]) for i in match_index]
        centers = [self.transfer_coordinate_format(center, size) for center in centers]
        return centers


if __name__ == '__main__':
    with open('./tu.jpg', mode='rb') as p:
        image_bytes =  p.read()

    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    centers = CaptchaParsing().run(image)
    print(f'centers: {centers}')
