import type { BookInfo } from './types'

/** 书目数据源自 bookshelf 主项目 data/bookshelf.db 的 books 表 */
export const BOOKS: BookInfo[] = [
  { id: 1, title: '星空的秘密', author: '张小光', category: '科普', description: '适合亲子共读的天文启蒙书' },
  { id: 2, title: '给孩子的中国历史', author: '王晓川', category: '历史', description: '用故事串起中国历史脉络' },
  { id: 3, title: '海边的灯塔', author: '林雨桐', category: '文学', description: '一则关于勇气的儿童小说' },
  { id: 4, title: '恐龙百科图鉴', author: '刘博文', category: '科普', description: '图文丰富的恐龙知识书' },
  { id: 5, title: '会飞的教室', author: '卡斯特纳', category: '文学', description: '经典儿童文学作品' },
  { id: 6, title: '地球真奇妙', author: '许知夏', category: '科普', description: '认识地貌、海洋与气候' },
  { id: 7, title: '小王子', author: '圣埃克苏佩里', category: '文学', description: '适合反复阅读的经典童话' },
  { id: 8, title: '厨房里的化学', author: '周可', category: '科普', description: '把厨房变成好玩的科学实验室' },
  { id: 9, title: '诗歌小花园', author: '许安然', category: '诗歌', description: '给低龄孩子的节气诗歌集' },
  { id: 10, title: '发明家的下午茶', author: '赵明远', category: '传记', description: '轻松了解著名发明家的故事' },
  { id: 11, title: '我的第一本物理书', author: '韩之遥', category: '科普', description: '从生活现象认识基础物理' },
  { id: 12, title: '森林邮局', author: '顾青禾', category: '绘本', description: '温柔治愈的动物绘本' },
  { id: 13, title: '给孩子的世界地图', author: '周游', category: '地理', description: '认识大洲大洋与不同文化' },
  { id: 14, title: '古诗词里的四季', author: '秦书雅', category: '诗歌', description: '用古诗词认识季节变化' },
  { id: 15, title: '机器人会做梦吗', author: '陈海蓝', category: '科幻', description: '孩子也能读懂的温和科幻故事' },
  { id: 16, title: '月亮写给晚安的信', author: '沈清禾', category: '绘本', description: '适合亲子睡前朗读的温暖绘本' },
  { id: 17, title: '窗边的小豆豆', author: '黑柳彻子', category: '文学', description: '一部温暖的儿童成长故事' },
  { id: 18, title: '夏洛的网', author: 'E.B.怀特', category: '文学', description: '讲述友谊、守护与成长的经典作品' },
  { id: 19, title: '昆虫记', author: '法布尔', category: '科普', description: '用生动的观察记录介绍昆虫世界' },
  { id: 20, title: '神奇校车：在人体中游览', author: '乔安娜·柯尔', category: '科普', description: '用故事和图画介绍人体知识' },
  { id: 21, title: '十万个为什么', author: '少年儿童出版社', category: '科普', description: '面向儿童的综合科学启蒙读物' },
  { id: 22, title: '中国神话故事', author: '袁珂', category: '文学', description: '精选中国传统神话故事' },
]

export type Member = {
  name: string
  role: 'parent' | 'child'
  avatar: string
}

/** 家庭成员源自主项目 users 表 */
export const MEMBERS: Member[] = [
  { name: '周妈妈', role: 'parent', avatar: '👩' },
  { name: '周爸爸', role: 'parent', avatar: '👨' },
  { name: '周知远', role: 'child', avatar: '🧒' },
  { name: '周星禾', role: 'child', avatar: '👧' },
]

/** 分类色：柔和霓虹色系 */
export const CATEGORY_COLORS: Record<string, string> = {
  科普: '#5eb3f6',
  文学: '#f47ab0',
  历史: '#f0a35e',
  诗歌: '#a78bfa',
  绘本: '#4ade9e',
  传记: '#fb923c',
  地理: '#2dd4cb',
  科幻: '#818cf8',
  未知: '#8b93b8',
}

export function categoryColor(category: string | undefined): string {
  return CATEGORY_COLORS[category ?? '未知'] ?? CATEGORY_COLORS['未知']
}
