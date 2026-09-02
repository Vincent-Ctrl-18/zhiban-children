const places = ['河南·焦作','山东·淄博','湖南·益阳','江西·萍乡','江西·九江','湖北·大悟','重庆·两江','安徽·合肥','重庆·双龙','湖北·恩施','云南·曲靖'];

const entries = [
  ['焦作启慧中心：在心理关怀中看见每一个孩子','走进焦作市启慧儿童心理健康教育中心，以爱心托管回应儿童真实的情绪与成长需要。','情感陪伴','hKjbaRA50sUfNSOfn9gEEg','hero.png'],
  ['淄博淄江社区：守护孩子的暑期童心','在社区托管现场，用课程、游戏和稳定陪伴，为孩子们搭起一方安心成长的天地。','社区托管','kN2l71w0ffTuWgJjNfd6-A','reading.png'],
  ['益阳爱心托管班：一堂多元、安全、有趣的暑期课','把安全教育与趣味课堂带进托管班，让知识在动手与合作中真正发生。','暑期课堂','gPr4WHHgyBA2W5zFY3XC_A','nature.png'],
  ['萍乡木杉塘社区：陪伴是一次次认真回应','实践队走进社区，从孩子的日常出发，让关心成为可以被感受到的具体行动。','社区实践','CnpoY3Sd1-ZV7iZtYC3KuA','hero.png'],
  ['九江湖西学校：从一次调研开始理解真实需求','走进校园、倾听师生，在真实场景中寻找乡村儿童成长支持的长期答案。','调研纪实','kHX89M4ZrS0YPmrj42D8mA','reading.png'],
  ['大悟县滨河小学：把问题带到现场，把答案留给行动','围绕教育支持与成长陪伴展开实地调研，为后续服务建立更可靠的依据。','调研纪实','eNQWHQCL2jwjA2Zswln-7g','nature.png'],
  ['重庆春华社区：在托管班里度过充实的一天','志愿者走进社区托管班，以课程和陪伴丰富孩子们的暑期生活。','志愿服务','aaAPMhYzvsMSjUBSgD-5Zw','hero.png'],
  ['合肥北城力高学校：让暑期助学连接更多可能','从学习支持到兴趣启发，一次助学服务也是一段共同成长的旅程。','暑期助学','5WDnobsEes7-3_kN6hlMqw','reading.png'],
  ['重庆双龙社区：让趣味课堂成为成长现场','多元课程走进公益托管班，让孩子在探索、表达和协作中打开新的视野。','公益课堂','tyl5mB6oW4vPnigMjKpY0g','nature.png'],
  ['恩施实践纪实：在山乡相遇，在行动中理解','走进湖北恩施，记录当地儿童成长环境，也记录实践队对陪伴意义的新认识。','山乡实践','ANUKdT0tyRCcoy0yWANRXA','hero.png'],
  ['青春赴科普，艺科共筑梦：云南曲靖实践纪实','科学与艺术在课堂相遇，以好奇心为起点，和孩子们共同完成一次夏日探索。','科普美育','wMsT-Rvy5NKV_crkvhMK6w','nature.png'],
];

export const practiceArticles = entries.map(([title, excerpt, category, slug], index) => ({
  id: `practice-${index + 1}`, title, excerpt, category,
  date: '2026 暑期', source: '智伴乡童', place: places[index],
  url: `https://mp.weixin.qq.com/s/${slug}`,
  cover: withBasePath(`/practice-covers/cover-${String(index + 1).padStart(2, '0')}.jpg`),
}));
import { withBasePath } from '../utils/paths';
